# シードデータ

- `pnpm db:migrate`: No migrations to apply（適用済み）
- `pnpm seed:dev-admin`: admin ユーザー投入（冪等）
  - email: dev-admin@example.com
  - username: dev-admin
  - role: admin (active)
  - session token: `dev-admin-session-token`
  - cookie: `__Host-session`（Secure-only → CDP で注入）

## 認証手順
agent-browser cookies set "__Host-session" "dev-admin-session-token" --url http://localhost:<port> --path / --secure --sameSite Lax
