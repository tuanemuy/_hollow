# Server Info — Issue #259 Manual Test

- 起動コマンド: `nohup pnpm dev > /tmp/manual-test-259-server.log 2>&1 &`
- PID ファイル: `/tmp/manual-test-259-server.pid`
- ログファイル: `/tmp/manual-test-259-server.log`
- URL: `http://localhost:3000/`
- ヘルスチェック応答: HTTP 307（未ログイン時にトップへ）
- 起動時間: 約 2 秒（既存ビルドキャッシュあり）
- アカウント: `existing@example.com` / `Password123!`（`.manual-test/2026-05-17/seed.sql` 由来）
- agent-browser セッション: `verify-259`
- 終了時クリーンアップ: `agent-browser --session verify-259 close && kill $(cat /tmp/manual-test-259-server.pid)`
