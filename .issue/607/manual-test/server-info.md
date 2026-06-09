# サーバー情報

- **起動コマンド**: `pnpm db:apply:local && pnpm dev`
- **ポート**: 3000
- **URL**: http://localhost:3000
- **PID**: `/tmp/manual-test-server.pid` 参照
- **検出ソース**: vite ログ（`Local: http://localhost:3000/`）

## ログイン（テストアカウント）

- メール: `dev-admin@example.com` / ユーザー名: `dev-admin`（admin / active）
- セッション注入（Secure cookie のため CDP 経由）:

  ```bash
  agent-browser --session {s} cookies set "__Host-session" "dev-admin-session-token" --url http://localhost:3000 --path / --secure --sameSite Lax
  ```
