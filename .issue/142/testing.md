# 動作確認計画 — Issue #142: Origin/Referer header verification for admin server functions

**Issue:** #142
**作成日:** 2026-05-30

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

CSRF 検証は実リクエストの `Origin` / `Referer` ヘッダと `APP_URL` の一致で判定する。`APP_URL` は `wrangler.toml` の `[vars]` で `http://localhost:8787` に設定されており、これは `pnpm start`（`wrangler dev`）が listen するオリジンと一致する。Origin 検証を正確に確認するには **`pnpm start`** を使う（`pnpm dev` の vite dev は別ポートになり得るため、Origin 一致検証では `pnpm start` を推奨）。

```bash
# 初回 / マイグレーション未適用なら
pnpm db:migrate

# Cloudflare ランタイム（localhost:8787、APP_URL と一致）で起動
pnpm start
```

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

### 1. 正しい Origin の admin POST が成功する（ブラウザ通常操作）

- **目的:** ブラウザから admin 画面で操作したとき、ブラウザが自動付与する `Origin` ヘッダが `APP_URL` と一致し、CSRF 検証を通過して従来どおり成功することを確認する。
- **手順:**
  1. `pnpm start` で起動し、`http://localhost:8787` に管理者アカウントでログインする。
  2. `/admin` 配下の各画面を開き、mutation 操作を1つずつ実行する:
     - LLM 設定の保存（`updateLLMConfigFn`）/ 接続テスト（`testLLMConnectionFn`）
     - ユーザーの suspend / reinstate / promote / demote（`UsersTable`）
     - ジョブの retry / 検索インデックス再構築（`Jobs`）
     - デザイントークンの保存 / リセット（`DesignTokensForm`）
     - プロンプトテンプレートの保存 / リセット（`PromptsForm`）
     - 登録ポリシーのトグル（`RegistrationForm`）
- **期待結果:** すべての操作が従来どおり成功する（403 にならない）。
- **確認ポイント:** ブラウザの DevTools Network タブで各 POST のレスポンスが 200 系であること。リクエストヘッダに `Origin: http://localhost:8787` が付いていること。

### 2. 異なる Origin の admin POST が 403 で reject される

- **目的:** cross-origin な state-changing リクエストが fail-closed で 403 になることを確認する。
- **手順:**
  1. `pnpm start` で起動した状態で、ログイン済みセッション cookie を控える（DevTools → Application → Cookies の `__Host-session` 値、または DevTools の該当リクエストを "Copy as cURL"）。
  2. admin POST エンドポイントに対し、異なる Origin ヘッダを付けて `curl` で叩く（例は LLM 設定。エンドポイントパスは DevTools Network で確認したものを使う）:
     ```bash
     curl -i -X POST 'http://localhost:8787/<admin-server-fn-path>' \
       -H 'Origin: https://evil.example.com' \
       -H 'Cookie: __Host-session=<コピーしたセッション値>' \
       -H 'Content-Type: application/json' \
       --data '{}'
     ```
- **期待結果:** HTTP 403 が返る。レスポンスボディは serialize 済みエラー（`kind: "forbidden"` 相当）で、サーバーログにスタックトレースが漏れていない（500 にならない）。
- **確認ポイント:** ステータスが 403 であること（500 や 200 でないこと）。`errorResponseMiddleware` を通った整形済みエラーになっていること。

### 3. Origin 欠落 + Referer 一致のフォールバック

- **目的:** `Origin` ヘッダが無い場合に `Referer` で代替検証され、同一オリジンの Referer なら通過することを確認する。
- **手順:**
  1. 上記同様の admin POST に対し、`Origin` を付けず同一オリジンの `Referer` を付けて叩く:
     ```bash
     curl -i -X POST 'http://localhost:8787/<admin-server-fn-path>' \
       -H 'Referer: http://localhost:8787/admin/settings' \
       -H 'Cookie: __Host-session=<セッション値>' \
       -H 'Content-Type: application/json' \
       --data '{}'
     ```
- **期待結果:** CSRF 検証を通過する（403 にならず、その先の処理 = admin guard / バリデーション等に到達する）。
- **確認ポイント:** 403 で止まらないこと。Referer が異なるオリジン（例 `https://evil.example.com/...`）の場合は 403 になること。

## エッジケース・異常系

### 1. Origin / Referer 両方欠落

- **目的:** safe でないメソッドで両ヘッダとも欠落した場合に 403（fail-closed）になることを確認する。
- **手順:**
  ```bash
  curl -i -X POST 'http://localhost:8787/<admin-server-fn-path>' \
    -H 'Cookie: __Host-session=<セッション値>' \
    -H 'Content-Type: application/json' \
    --data '{}'
  ```
- **期待結果:** HTTP 403。

## 既存機能への影響確認

- **GET ローダー（`loadInstanceSettings` / `loadJobsSnapshot` / `loadAdminUsers` / `loadUsageMetrics`）:** `serverData` 経由で middleware を通らないため CSRF の影響を受けない。admin 各画面が従来どおりデータを表示できることを確認する。
- **認証セッション cookie:** ログイン / ログアウト / セッション維持が従来どおり動作すること（本変更は cookie 発行に触れていない）。`__Host-session` cookie の属性（SameSite=lax / Secure）が変わっていないこと。
- **admin 以外の mutation（note 作成・編集等）:** 本変更の対象外。従来どおり動作すること（CSRF middleware は付与していない）。

## 確認チェックリスト

- [ ] 正しい Origin の admin POST（全 13 関数）がブラウザ操作で成功する
- [ ] 異なる Origin の admin POST が 403 で reject される（500 でない）
- [ ] Origin 欠落 + 同一オリジン Referer のフォールバックが通過する
- [ ] Origin 欠落 + 異なるオリジン Referer が 403 になる
- [ ] Origin / Referer 両欠落で 403 になる
- [ ] GET ローダー（admin 画面のデータ表示）が影響を受けない
- [ ] ログイン / ログアウト / セッション cookie 挙動が従来どおり
