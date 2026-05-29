# Server Info — Issue #127 manual-test

- URL: http://localhost:5180/
- 起動コマンド: `pnpm dev --port 5180`（バックグラウンド）
- PID file: `/tmp/manual-test-127-server.pid`
- ログ: `/tmp/manual-test-127-server.log`
- ローカル D1 binding: `hollow-local-d1`（`--local`）

## テストアカウント
- email: `linktest@example.com`
- password: `Password123!`
- user id: `01999127-0000-7000-8000-000000000001`
- email_verified=1 / active / root directory 投入済み
- ログイン: http://localhost:5180/login

## D1 確認 SQL
```
wrangler d1 execute hollow-local-d1 --local --command "SELECT ref_kind, ref_target, resolved_note_id FROM note_internal_links ORDER BY rowid DESC LIMIT 10"
```
