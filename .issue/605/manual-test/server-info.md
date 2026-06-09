# Server info — Issue #605 manual test

- Command: `PORT=3000 nohup pnpm dev > /tmp/manual-test-605-server.log 2>&1 &`
- Runtime: vite dev (workerd) targeting Cloudflare Workers + local D1.
- URL: http://localhost:3000/
- PID file: `/tmp/manual-test-605-server.pid` (PID 71895)
- Log: `/tmp/manual-test-605-server.log`
- Health check: `GET /` → HTTP 200 (server ready).
- D1 binding: `hollow-local-d1 --local` (same store written by `db:execute:local`
  and `seed:dev-admin`).
