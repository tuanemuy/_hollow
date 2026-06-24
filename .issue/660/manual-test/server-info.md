# Server Info — Issue #660 manual-test

- PID: (see /tmp/manual-test-server.pid)
- Port: 3000 (vite ignored PORT env; uses configured 3000)
- Home (auth): http://localhost:3000/
- Public top (no auth): http://localhost:3000/u/dev-admin
- Auth cookie: __Host-session = dev-admin-session-token (Secure-only, inject via CDP)
