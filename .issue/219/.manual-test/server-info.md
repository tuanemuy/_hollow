# Server Info

- **PID**: $(cat /tmp/manual-test-server.pid)
- **Port**: 3000
- **URL**: http://localhost:3000
- **Health**: `/login` returns 200 (server responding). `/` returns 307 → `/?page=1&limit=20` (default search params injection by validateSearch).
- **Log**: /tmp/manual-test-server.log
