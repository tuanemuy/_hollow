# Seed Data — Issue #840 manual-test

- `pnpm db:migrate`（No migrations to apply / 適用済み）
- `pnpm seed:dev-admin`（冪等）
  - email: dev-admin@example.com / username: dev-admin / role: admin (active)
  - session token: `dev-admin-session-token`
  - cookie: `__Host-session`（Secure-only。CDP でのみ注入可）
- cookie 注入コマンド:
  `agent-browser --session <s> cookies set "__Host-session" "dev-admin-session-token" --url http://localhost:8787 --path / --secure --sameSite Lax`
