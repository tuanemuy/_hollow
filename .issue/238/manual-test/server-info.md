# Server info — Issue #238 manual-test

- Command: `pnpm dev` (Cloudflare Workers local runtime via Vite)
- PID file: `/tmp/manual-test-238.pid`
- Log: `/tmp/manual-test-238-server.log`
- URL: http://localhost:3001/ (PORT env is ignored by the vite config; 3000 was
  in use so it fell back to 3001)
- Healthcheck: `GET /` → 200
