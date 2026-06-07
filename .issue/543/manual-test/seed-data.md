# Issue #543 ブラウザ検証用シードデータ

`pnpm seed:dev-admin` + bio/username UPDATE でローカル D1 に投入。

## ログインユーザー
- email: dev-admin@example.com / role: admin / active / email_verified
- username: `dev-admin` / display_name: `Dev Admin`
- bio: 「開発環境テスト用のダミーアカウントです。設定画面の動作確認に使っています。」（37文字 → カウンタ `37 / 500`）
- session token (`__Host-session`): `dev-admin-session-token`（expires 2999）

## APP_URL
- `wrangler.toml [vars]` に `APP_URL = "http://localhost:8787"` → URLプレビューは絶対 `http://localhost:8787/u/dev-admin`

## cookie 注入
agent-browser cookies set "__Host-session" "dev-admin-session-token" --url http://localhost:<port> --path / --secure --sameSite Lax
