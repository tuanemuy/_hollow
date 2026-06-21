# シードデータ — Issue #509 ブラウザ検証

## 実行した準備

1. `pnpm db:migrate` — ローカル D1 にスキーマ適用（0001〜0020）
2. `pnpm seed:dev-admin` — 決定論的 admin ユーザー＋セッション投入（冪等）
3. `/tmp/seed-export-jobs.sql` を `pnpm db:execute:local` で投入 — 6 status バリアントの export_jobs

## 認証情報

- email: `dev-admin@example.com` / role: admin (active)
- session cookie: `__Host-session` = `dev-admin-session-token`（Secure-only、CDP 経由注入）
- user id: `01950000-0000-7000-8000-000000000001`

## export_jobs シード（6 status）

| id 末尾 | format | scope | status | progress | 備考 |
|---|---|---|---|---|---|
| ...110 | markdown | multiple | pending | 0/5 | queued 相当 |
| ...111 | html | multiple | processing | 2/5 | 進捗バー表示対象 |
| ...112 | pdf | single | completed | 1/1 | artifact あり・expiresAt 7日後 |
| ...113 | markdown | multiple | failed | 1/3 | errorReason・failedNoteIds あり |
| ...114 | html | single | cancelled | 0/1 | |
| ...115 | markdown | multiple | expired | 2/2 | expiresAt 過去 |

## 対象ルート

- `/export` — ExportForm（P15）
- `/exports` — ExportJobsList（P16 一覧、6ジョブ表示）
- `/exports/<id>` — ExportJobDetail（P16 詳細）
