# シードデータ

- コマンド: `pnpm db:migrate`（No migrations to apply）/ `pnpm seed:dev-admin`
- ユーザー: dev-admin@example.com / username: dev-admin / role: admin
- セッショントークン: dev-admin-session-token
- cookie: `__Host-session`（Secure-only のため document.cookie では設定不可、CDP で注入）
  - `agent-browser cookies set "__Host-session" "dev-admin-session-token" --url http://localhost:5175 --path / --secure --sameSite Lax`
