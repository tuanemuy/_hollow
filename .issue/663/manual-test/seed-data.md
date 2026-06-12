# シードデータ整備 — Issue #663

- `pnpm db:migrate` — 適用済み（No migrations to apply）
- `pnpm seed:dev-admin` — dev-admin@example.com / username: dev-admin / role: admin (active)
- セッショントークン: `dev-admin-session-token`（`__Host-session` cookie として CDP 経由で注入）
- 一括エクスポート対象のノートはテスト中に UI から作成する（既存ローカル D1 のデータがあればそれを使用）
