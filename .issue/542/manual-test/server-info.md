# Server Info — Issue #542 manual-test

- PID file: /tmp/manual-test-542-server.pid
- Log: /tmp/manual-test-542-server.log
- URL: http://localhost:3001/
- 起動コマンド: `pnpm dev`（vite dev / Cloudflare ランタイム。PORT env は無視され 3000→3001 にフォールバック）
- ログイン: Cookie `__Host-session` に raw token `dev-admin-session-token` を CDP 経由で注入
