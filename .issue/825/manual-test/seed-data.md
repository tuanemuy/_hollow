# シードデータ

- コマンド: `pnpm db:migrate`（No migrations to apply）→ `pnpm seed:dev-admin`
- 管理者: dev-admin@example.com / username: dev-admin / role: admin
- セッショントークン: `dev-admin-session-token`（cookie `__Host-session`、Secure のため CDP 経由で注入）
- 認証必須ルート `/notes/new` を使用（ノート投入不要で最短）
