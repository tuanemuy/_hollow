# Seed Data — Issue #382 manual-test

Issue #382（アイコンのみ化の表示/a11y検証）のブラウザテスト用に整備したローカル環境の記録。

## DB / マイグレーション

- DB名: `hollow-local-d1`（`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`、`pnpm dev` が配信）
- 実行形: `pnpm wrangler d1 execute hollow-local-d1 --local --command "..."`
- `pnpm db:migrate` → 全14マイグレーション適用済み（追加なし）

## ログイン情報（admin）

| 項目 | 値 |
|---|---|
| email | `admin@example.com` |
| password | `Password123!` |
| user.id | `01938f00-0000-7000-8000-0000000000c1` |
| role | `admin`（email_verified=1, banned=0）|

既存 seed（`.manual-test/2026-05-17/seed.sql` + `reseed.sh`）で投入済みの admin user を流用。credential は legacy pbkdf2 → 初回ログインで scrypt に lazy upgrade される（`Password123!` は有効）。

## 検証に使うアクティブノート

| id | title | path |
|---|---|---|
| `019e8200-0000-7000-8000-000000000382` | `manual-test-note-382` | `/notes/019e8200-0000-7000-8000-000000000382` |

詳細ページの「編集」「複製」アイコンのみボタン確認に使用。ホームツールバー（「新規作成」「アップロード」）は `/`。

破壊的TextはこのIssueでは無し。万一データが消えたら `./.manual-test/2026-05-17/reseed.sh` で復元。
