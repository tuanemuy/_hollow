# Server Info

- URL: http://localhost:3000/
- PID file: /tmp/manual-test-server.pid
- Log: /tmp/manual-test-server.log
- Started: 2026-05-21 (manual-test session)
- Command: `pnpm dev` (vite + workerd + miniflare)
- Health: HTTP 307 from `/`

## Environment state (TC-EDGE-1 phase)

- `.dev.vars` `ADMIN_LLM_API_KEY=""` (empty → triggers Stub fallback)
- `.dev.vars` `ADMIN_SETUP_TOKEN="dev-setup-token-tc-edge-2026"` (enables `/setup` page)
- `wrangler.toml` `ADMIN_LLM_MODEL = "claude-3-5-sonnet-latest"` (unchanged)
- Backups: `.dev.vars.backup-tc-edge`, `wrangler.toml.backup-tc-edge`
