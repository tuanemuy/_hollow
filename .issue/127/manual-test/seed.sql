-- Issue #127 manual-test seed
--
-- Provides a single login-capable, email-verified member account that the
-- agent-browser verification phase uses to sign in and create notes / internal
-- links. No notes are seeded on purpose — note creation and internal-link
-- authoring are themselves the UI operations under test.
--
-- The signUp usecase is bypassed, so the rows it would normally create are
-- inserted by hand:
--   users      — member, email_verified=1 (status -> "active", login succeeds)
--   accounts   — credential provider, PBKDF2-SHA256/600k for "Password123!"
--                (legacy format; the app lazily rehashes to scrypt on first login)
--   directories— root directory (depth 0, empty name/slug) so note creation works
--
-- Idempotent via INSERT OR IGNORE keyed on PRIMARY KEY (id).
-- ID band 01999127-* (issue number 127) avoids collision with the
-- 01938f00-* / 01938f01-* / 01999308-* baselines.

INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username,
  role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01999127-0000-7000-8000-000000000001',
  'linktest',
  'linktest@example.com',
  1, NULL,
  '2026-05-29T00:00:00.000Z',
  '2026-05-29T00:00:00.000Z',
  'linktest', NULL,
  'member',
  0, NULL, NULL,
  NULL, NULL, NULL, NULL
);

INSERT OR IGNORE INTO accounts (
  id, user_id, account_id, provider_id,
  password, access_token, refresh_token, id_token,
  access_token_expires_at, refresh_token_expires_at, scope,
  created_at, updated_at
) VALUES (
  '01999127-0000-7000-8000-000000000002',
  '01999127-0000-7000-8000-000000000001',
  '01999127-0000-7000-8000-000000000001',
  'credential',
  'pbkdf2-sha256-v1$600000$gVVKFRQQ1xc0bgMpB2F2Ew==$+kidyWmk9+9DK6nYcd7aJ5ZfCgDC1PumAMne14DlW3c=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-29T00:00:00.000Z',
  '2026-05-29T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01999127-0000-7000-8000-000000000003',
  '01999127-0000-7000-8000-000000000001',
  NULL, '', '', 0, 0,
  '2026-05-29T00:00:00.000Z',
  '2026-05-29T00:00:00.000Z'
);
