# シードデータ整備 — Issue #657

- `pnpm db:migrate` — 適用済み（No migrations to apply）
- `pnpm seed:dev-admin` — dev-admin@example.com / username: dev-admin / role: admin
- セッション token: `dev-admin-session-token`（`__Host-session` を CDP で注入）
- サーバー: `pnpm build && pnpm start -- --port 8787`（http://localhost:8787、バックグラウンドタスク bwhqnk188）
