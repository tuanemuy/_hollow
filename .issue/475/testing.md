# 動作確認計画 — Issue #475: _app の外に取り残された認証必須ルートに AppShell を付ける

**Issue:** #475
**作成日:** 2026-06-05

---

## 確認環境

このIssueの変更（`/views`・`/exports` を `_app` 配下へ取り込み AppShell を付与）を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:apply:local   # ローカル D1 にマイグレーション適用（初回・スキーマ未適用時）
pnpm seed:dev-admin   # 動作確認用の管理ユーザー等をシード
pnpm dev              # 開発サーバー起動（vite dev / Cloudflare ランタイム）
```

### デプロイ方法

なし（検証環境のみで確認できる。ステージング/本番へのデプロイは本 Issue の確認に不要）。

## 確認項目

### 1. `/views` に AppShell（Header/Sidebar）が付く

- **目的:** 保存ビュー一覧ページが他の `_app` ページと同じ Header＋Sidebar を着て表示されること。
- **手順:**
  1. ログイン状態で `/views` にアクセスする。
  2. ページ上部に Header、左に Sidebar が表示されることを確認する。
  3. URL が `/views`（`_app` プレフィックスが付かない）であることを確認する。
  4. `/views?kind=public` にアクセスし、公開ビュータブ相当の表示に切り替わることを確認する（validateSearch 動作）。
- **期待結果:** Header/Sidebar 付きで保存ビュー一覧が描画され、URL は `/views` のまま。
- **確認ポイント:** ベアな（chrome なしの）表示になっていないこと。`?kind` が効くこと。

### 2. `/views` の保存ビュー mutation が動作する

- **目的:** 移動後も `SavedViewsList/action`（6 mutation）が RSC マニフェストに登録され実行できること。
- **手順:**
  1. `/views` で保存ビューのリネーム・デフォルト設定・削除などの操作を行う。
- **期待結果:** server-fn が正常に実行され、操作が反映される（action 未登録エラーが出ない）。
- **確認ポイント:** ブラウザコンソール/サーバーログに server function 未登録系のエラーが出ないこと。

### 3. `/exports` に AppShell が付く

- **目的:** エクスポートジョブ一覧が Header＋Sidebar 付きで表示されること。
- **手順:**
  1. ログイン状態で `/exports` にアクセスする。
  2. Header／Sidebar の表示と、ジョブ一覧の描画を確認する。
  3. URL が `/exports` のままであることを確認する。
  4. `/exports?offset=0` などページング用パラメータが効くことを確認する。
- **期待結果:** Header/Sidebar 付きでジョブ一覧が描画され、URL は `/exports`。
- **確認ポイント:** ベア表示でないこと、`?offset` が効くこと。

### 4. `/exports` のエクスポート実行 action が動作する

- **目的:** 移動後も `ExportForm/action` が登録され、エクスポート実行できること。
- **手順:**
  1. `/exports` でエクスポートフォームから実行する。
- **期待結果:** ジョブが作成され一覧に反映される（action 未登録エラーが出ない）。

### 5. `/exports/$jobId` の詳細表示

- **目的:** ジョブ詳細ページが Header/Sidebar 付きで描画され、errorComponent も機能すること。
- **手順:**
  1. `/exports` の一覧からジョブ詳細（`/exports/{jobId}`）に遷移する。
  2. 詳細が描画されることを確認する。
- **期待結果:** Header/Sidebar 付きで詳細が表示される。URL は `/exports/{jobId}`。

### 6. `_app` 内での SPA 遷移で AppShell が保持される

- **目的:** AppShell が再マウントされず保持されること（#293 の持続化が `/views`/`/exports` にも効く）。
- **手順:**
  1. `/`（ホーム）→ `/views` → `/exports` → `/tags` → `/settings/profile` の順に SPA 遷移する。
- **期待結果:** 各遷移で Header/Sidebar がちらつき/再マウントなく保持され、コンテンツのみ差し替わる。

## エッジケース・異常系

### 1. 未認証で `/views`・`/exports` に直アクセス

- **目的:** 認証ガードが `_app` loader へ委譲された後も未認証アクセスがブロックされること。
- **手順:**
  1. ログアウト状態で `/views`（および `/exports`）に直アクセスする。
- **期待結果:** `_app` loader 経由で `/`（ホーム/ランディング、`HOME_SEARCH` 付き）へ redirect される。
  - 注: 取り込み前は `requireAuthenticatedRoute` により `/login` へ飛んでいたが、本 Issue で `_app` の挙動（`/` へ redirect）に統一される（意図的変更）。

## 既存機能への影響確認

- `/`（ホーム）・`/tags`・`/trash`・`/settings/*` など既存 `_app` ページが従来通り表示・動作すること（routeTree 再生成の巻き込み確認）。
- `/admin/*`（独立シェル）・`/search`（公開ページ）が影響を受けていないこと。

## 確認チェックリスト

- [ ] `/views` に Header/Sidebar が付き URL は `/views` のまま
- [ ] `/views` の `?kind` が効く
- [ ] `/views` の保存ビュー mutation（リネーム/デフォルト/削除）が動作
- [ ] `/exports` に Header/Sidebar が付き URL は `/exports` のまま
- [ ] `/exports` の `?offset` が効く
- [ ] `/exports` のエクスポート実行 action が動作
- [ ] `/exports/$jobId` 詳細が Header/Sidebar 付きで表示
- [ ] `_app` 内 SPA 遷移で AppShell が保持される
- [ ] 未認証直アクセスで `/` へ redirect される
- [ ] 既存 `_app` ページ（`/`, `/tags`, `/settings/*`）が従来通り動作
