# Server Info

- Command: `pnpm dev --port 3001`
- Port: 3001 (3000 was held by a `hollow` worktree dev server)
- URL: http://localhost:3001/
- PID file: `/tmp/manual-test-240-server.pid`
- Log: `/tmp/manual-test-240-server.log`
- Health check: `GET /` returned `307` (redirect, expected — app sends unauthenticated traffic to /signin)
