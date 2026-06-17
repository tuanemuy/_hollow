# Seed Data — Issue #732 manual-test

- `pnpm db:migrate`: 適用済み（No migrations to apply）
- `pnpm seed:dev-admin`: 冪等。管理者ユーザーをシード
  - email: dev-admin@example.com / username: dev-admin / role: admin(active)
  - session token: `dev-admin-session-token`
  - cookie 名: `__Host-session`（Secure-only。document.cookie 不可、CDP 経由注入が必要）
    - 注入: `agent-browser --session <s> cookies set "__Host-session" "dev-admin-session-token" --url http://localhost:3000 --path / --secure --sameSite Lax`
