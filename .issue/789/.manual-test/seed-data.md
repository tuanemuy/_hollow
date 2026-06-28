# シードデータ

## ユーザー
- `pnpm seed:dev-admin` で投入。email: dev-admin@example.com / username: dev-admin / role: admin
- owner_id: `01950000-0000-7000-8000-000000000001`
- session token: `dev-admin-session-token`（cookie `__Host-session`）

## タグ（autocomplete 検証用）
SQL で直接投入（`tags` テーブル、owner = dev-admin）:
- `react`, `typescript`, `javascript`, `foobarbaz`, `日本語タグ`
- 既存タグも併存: `622`, `aaa`, `design`, `draftsave`, `guide` 等

name_normalized は `name.toLowerCase()`（tagRepository の normalizeName 準拠）。
