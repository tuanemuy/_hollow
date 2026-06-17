# Server Info — Issue #595 manual test

- command: `pnpm dev`（vite dev / workerd, Cloudflare runtime）
- PID: 26588（`pnpm dev` ラッパー。実プロセスツリーは vite/workerd）
- port: 3000
- URL: http://localhost:3000
- admin: http://localhost:3000/admin
- log: /tmp/manual-test-595-server.log
- health: `curl http://localhost:3000/` → HTTP 200（起動後 約2 秒で ready）
- 認証: cookie `__Host-session=dev-admin-session-token`（Secure-only, CDP 経由で注入）

起動エラーなし。ログには TanStack の `inputValidator deprecated` 警告のみ（本 Issue 無関係）。
