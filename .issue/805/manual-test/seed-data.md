# Issue #805 マニュアルテスト シードデータ / 手順

対象3画面（admin/Dashboard・admin/Metrics・identity/AccountDeleteForm）をローカルの
dev サーバー（http://localhost:3000）でブラウザから開けるようにするための準備記録。

ローカル D1（`hollow-local-d1` / `--local`）のみを操作。既存の本番相当データは削除・上書きしていない。

## 実行した準備作業

1. `.issue/805/testing.md` を読み、確認対象の3画面と必要データ（管理者ロール、メディア付きユーザー）を把握。
2. 認証・ロールの仕組みを調査（`app/routes/admin/route.tsx`、`app/lib/server/currentUser.ts` の `requireAdminUser` / `requireCurrentUser`、`app/core/adapters/d1/schema.ts` の users/sessions/accounts/media_assets）。
3. 既存 seed スクリプト（`scripts/seed-dev-admin.mjs` / `scripts/seed-dev-login.mjs`）で作られる想定のユーザーがローカル D1 に既に存在することを確認（`dev-admin` = admin/active、`dev-login` = member/active、credential パスワードあり、admin セッションあり）。追加投入は不要だった。
4. 不足していた「メディアを持つ一般ユーザー」を補うため、`dev-login` に `status='attached'` のメディア資産を2件投入（`media_assets`）。`aggregateByOwner` は `status='attached'` のみ集計するため attached で投入。
5. パスワードフォームを使わずブラウザ検証できるよう、`dev-login` 用の固定セッションを1件投入（`sessions`）。
6. 各画面の HTTP 応答を curl で確認（下記「到達確認」）。

## 投入したシードデータ（今回追加分）

すべて明確なテスト用の値（storage_key に `test/805/` プレフィックス、固定 UUIDv7、遠い過去/未来の固定日時）。冪等（固定 id を delete → insert）。

### media_assets（owner = dev-login: `01950000-0000-7000-8000-000000000010`）

| id | kind | mime | byte_size | status |
|----|------|------|-----------|--------|
| `01950000-0000-7000-8000-000000000020` | image | image/png | 2097152 | attached |
| `01950000-0000-7000-8000-000000000021` | image | image/jpeg | 1572864 | attached |

集計結果: `count = 2` / `totalBytes = 3670016` → `formatBytes` 出力 **`3.5 MB`**。
AccountDeleteForm の表示は「アップロード済みメディア **2 件 / 3.5 MB**」。

### sessions（dev-login のブラウザ用固定セッション）

| id | user_id | token | expires_at |
|----|---------|-------|------------|
| `01950000-0000-7000-8000-000000000030` | `01950000-0000-7000-8000-000000000010` | `dev-login-session-token` | 2999-12-31T23:59:59.000Z |

### 既存で流用したデータ（今回は再投入せず確認のみ）

- 管理者: `dev-admin` (`01950000-0000-7000-8000-000000000001`) role=admin / active。
  固定セッション token = `dev-admin-session-token`（expires 2999-…、投入済み）。
- 一般（パスワードログイン可）: `dev-login` (`01950000-0000-7000-8000-000000000010`) role=member / active、
  `accounts` に credential パスワードハッシュあり。

投入 SQL は本ファイルと同ディレクトリの手順で再現可能（scratchpad の
`seed-805-media.sql` / `seed-805-session.sql` と同内容）。再投入する場合は以下を
`pnpm db:execute:local <file>` で流す。

## テストで使うアカウント

| 用途 | email | password | role | セッション token |
|------|-------|----------|------|------------------|
| 管理者（Dashboard/Metrics） | dev-admin@example.com | （パスワード未設定・セッション注入のみ） | admin | `dev-admin-session-token` |
| 一般（AccountDeleteForm・メディア2件） | dev-login@example.com | `DevPassw0rd!2024` | member | `dev-login-session-token` |

- `dev-admin` は credential パスワードを持たないため /login フォームでは入れない。セッション cookie 注入でログインする。
- `dev-login` はパスワードフォームでもセッション cookie 注入でもログイン可。

## 対象3画面の URL パスと到達手順

`_app` はパスなしレイアウトのため URL からは消える（`/_app/settings/...` → `/settings/...`）。

| # | 画面 | URL | 必要アカウント |
|---|------|-----|----------------|
| 1 | 管理ダッシュボード（admin/Dashboard、合計/R2/DO ストレージ） | `/admin` | dev-admin（管理者） |
| 2 | 管理メトリクス（admin/Metrics、上限値・ストレージ） | `/admin/metrics` | dev-admin（管理者） |
| 3 | アカウント削除フォーム（identity/AccountDeleteForm、メディア合計サイズ） | `/settings/account-delete` | dev-login（メディア2件） |

### 到達確認（curl、SSR ステータスのみ。本文は RSC ストリームのため curl grep では見えない）

- Cookie 未添付: `/admin` 200（未認証は errorComponent 描画）、`/settings/account-delete` 307（→ /login リダイレクト）。
- `Cookie: __Host-session=dev-admin-session-token`: `/admin` 200 / `/admin/metrics` 200 / `/settings/account-delete` 200。
- `Cookie: __Host-session=dev-login-session-token`: `/settings/account-delete` 200（メディア2件のユーザー）。

## ログインの具体的手順（ローカル認証フロー）

このプロジェクトはメール+パスワードのセッション認証。マジックリンクではない。
セッションは raw token 一致で解決（`D1SessionService.resolve`）、cookie 名は `__Host-session`（Secure）。

### 方法A: セッション cookie 注入（管理画面の推奨・パスワード不要）

cookie 名 `__Host-session` は Secure 属性のため `document.cookie` では設定できない。agent-browser では CDP 経由で注入する。

```
# 管理者として（Dashboard / Metrics）
agent-browser cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:3000 --path / --secure --sameSite Lax
# → http://localhost:3000/admin , http://localhost:3000/admin/metrics

# メディア持ち一般ユーザーとして（AccountDeleteForm）
agent-browser cookies set "__Host-session" "dev-login-session-token" \
  --url http://localhost:3000 --path / --secure --sameSite Lax
# → http://localhost:3000/settings/account-delete
```

### 方法B: /login フォームでパスワードログイン（dev-login のみ）

1. http://localhost:3000/login を開く
2. email: `dev-login@example.com` / password: `DevPassw0rd!2024`
3. ログイン後 http://localhost:3000/settings/account-delete へ遷移

## 期待される表示（formatBytes 観点）

- AccountDeleteForm（dev-login）: 「2 件 / **3.5 MB**」。
- AccountDeleteForm（dev-admin など メディア0のユーザー）: 「0 件 / **0 B**」。
- Dashboard / Metrics のストレージ: R2 / DO のバイト数はローカルの R2 / Durable Object
  バインディング由来。ローカルでは 0 または未取得（null → **`—`** U+2014）になり得る。
  testing.md の通り 0 / null でも `formatBytes` は正しく描画されるため、これは仕様どおりで問題なし。

## 問題・注意点

- **ストレージ値は非ゼロにできない可能性が高い**: Dashboard/Metrics の R2/DO ストレージは
  実バインディング集計であり、ローカル dev では 0 または null（"—"）で表示される見込み。
  testing.md でも 0/null 表示が許容されているため、`formatBytes` の描画確認としては十分。
  「非ゼロの合計ストレージ」を厳密に見たい場合は R2/DO のローカルエミュレーションにデータを
  積む必要があり、本 Issue（表示フォーマッタ集約）の検証には不要と判断した。
- **`__Host-` Secure cookie**: http://localhost では最近のブラウザは Secure cookie を許容するが、
  `document.cookie` からは設定不可。必ず CDP / DevTools 経由で注入する。
- 既存ローカル D1 には多数のテストユーザーが存在するが、今回追加したのは上記
  media_assets 2件 + sessions 1件のみ。既存行の削除・上書きはしていない。
