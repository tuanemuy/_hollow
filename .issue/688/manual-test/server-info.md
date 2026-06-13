# Server Info — Issue #688 manual-test

- URL: http://localhost:3000
- PID file: /tmp/manual-test-688-server.pid
- Log: /tmp/manual-test-688-server.log
- Port: 3000 (vite config 固定。PORT 環境変数は無視される)

## Seed
- login user: dev-login@example.com / DevPassw0rd!2024 (role=member, active)
- seed コマンド: `node scripts/seed-dev-login.mjs`（冪等）
- ノート/ディレクトリは未投入 → UI 上でログイン後に作成して検証する
