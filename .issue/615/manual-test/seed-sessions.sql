-- Issue #615 (P22 session list richness) browser verification seed.
-- Injects 4 extra ACTIVE sessions for the test-615 user, each with a DIFFERENT
-- userAgent / ipAddress / updatedAt, so device-parser label + icon differences
-- and relative-time formatting can be verified. agent-browser can only log in
-- with a single UA, so the differing-UA rows are inserted directly.
--
-- Time base ("now") at injection: ~2026-06-24T16:35Z (server clock).
-- All expires_at are far future so listForUser (expires_at > now) returns them.
-- All ids/tokens are unique and clearly test-only. user_id matches test-615.
-- Local D1 only. Idempotent: removes these specific test rows first.

DELETE FROM sessions WHERE id IN (
  '01951615-0000-7000-8000-0000000000a1',
  '01951615-0000-7000-8000-0000000000a2',
  '01951615-0000-7000-8000-0000000000a3',
  '01951615-0000-7000-8000-0000000000a4'
);

-- 1) macOS Safari — desktop laptop glyph, "Safari on macOS", real IP, ~3h ago.
INSERT INTO sessions (id, user_id, token, expires_at, created_at, updated_at, ip_address, user_agent, impersonated_by)
VALUES (
  '01951615-0000-7000-8000-0000000000a1',
  '01951615-0000-7000-8000-000000000001',
  'test615-session-macos-safari-aaaaaaaaaaaaaaaa',
  '2026-09-01T00:00:00.000Z',
  '2026-06-24T09:00:00.000Z',
  '2026-06-24T13:35:00.000Z',
  '203.0.113.10',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  NULL
);

-- 2) Windows Chrome — desktop glyph, "Chrome on Windows", real IP, ~3 days ago.
INSERT INTO sessions (id, user_id, token, expires_at, created_at, updated_at, ip_address, user_agent, impersonated_by)
VALUES (
  '01951615-0000-7000-8000-0000000000a2',
  '01951615-0000-7000-8000-000000000001',
  'test615-session-windows-chrome-bbbbbbbbbbbbbbbb',
  '2026-09-01T00:00:00.000Z',
  '2026-06-18T08:00:00.000Z',
  '2026-06-21T16:35:00.000Z',
  '198.51.100.42',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  NULL
);

-- 3) iPhone Safari — mobile glyph, "Safari on iOS", real IP, ~5 minutes ago.
INSERT INTO sessions (id, user_id, token, expires_at, created_at, updated_at, ip_address, user_agent, impersonated_by)
VALUES (
  '01951615-0000-7000-8000-0000000000a3',
  '01951615-0000-7000-8000-000000000001',
  'test615-session-iphone-safari-cccccccccccccccc',
  '2026-09-01T00:00:00.000Z',
  '2026-06-24T15:00:00.000Z',
  '2026-06-24T16:30:00.000Z',
  '203.0.113.77',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  NULL
);

-- 4) Unknown device — non-browser UA (curl), IP null → "不明な端末" + IP行省略, ~2h ago.
INSERT INTO sessions (id, user_id, token, expires_at, created_at, updated_at, ip_address, user_agent, impersonated_by)
VALUES (
  '01951615-0000-7000-8000-0000000000a4',
  '01951615-0000-7000-8000-000000000001',
  'test615-session-unknown-curl-dddddddddddddddd',
  '2026-09-01T00:00:00.000Z',
  '2026-06-24T14:00:00.000Z',
  '2026-06-24T14:35:00.000Z',
  NULL,
  'curl/8.0.1',
  NULL
);
