# Server Info — Issue #389 manual test

- 起動コマンド: `pnpm dev --port 3100`（vite dev、ソース直結）
- ポート: 3100（3000 が使用中のため変更）
- URL: http://localhost:3100/
- PID file: /tmp/mt389-server.pid
- ログ: /tmp/mt389-server.log
- ヘルスチェック: GET / → 200
- ログイン: cookie `__Host-session` = `seed389-tEsTsEsSiOnToKeN-bbbbbbbbbbbbbbbbbbbbbbbb`（agent-browser cookies set, --secure --httpOnly）
