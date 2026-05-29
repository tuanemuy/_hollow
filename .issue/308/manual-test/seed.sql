-- Issue #308 manual-test seed
--
-- Adds the minimum data that TC-1 (TagActions) and TC-2 (AccountDeleteForm)
-- need on top of the .manual-test/2026-05-17/ baseline. TC-3 (UsersTable)
-- is fully covered by the baseline (admin-user / existing-user / tc-suspended).
--
-- Idempotent via INSERT OR IGNORE keyed on PRIMARY KEY (id).

-- ---------------------------------------------------------------------------
-- TC-1: Two extra tags for existing-user so that the "merge" branch
-- (which only shows when >=2 sibling tags exist) is testable.
-- existing-user already owns the tag "232" from prior test runs; these add
-- two more so the rename / merge / delete actions all have material.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO tags (
  id, owner_id, name, name_normalized, note_count, version, created_at, updated_at
) VALUES (
  '01999308-0000-7000-8000-000000000001',
  '01938f00-0000-7000-8000-0000000000a1',
  'issue308-tag-a',
  'issue308-tag-a',
  0, 0,
  '2026-05-29T00:00:00.000Z',
  '2026-05-29T00:00:00.000Z'
);

INSERT OR IGNORE INTO tags (
  id, owner_id, name, name_normalized, note_count, version, created_at, updated_at
) VALUES (
  '01999308-0000-7000-8000-000000000002',
  '01938f00-0000-7000-8000-0000000000a1',
  'issue308-tag-b',
  'issue308-tag-b',
  0, 0,
  '2026-05-29T00:00:00.000Z',
  '2026-05-29T00:00:00.000Z'
);

-- ---------------------------------------------------------------------------
-- TC-2: Throwaway member account for AccountDeleteForm.
-- Username:      test-issue308-delete
-- Email:         test-issue308-delete@example.com
-- Password:      Password123!  (PBKDF2-SHA256, 600k iter)
-- Role / state:  member, email_verified=1, banned=0
-- After running TC-2 this row is gone. Use reseed.sh (this file) to
-- reinstate it before re-running the test.
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username,
  role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01999308-0000-7000-8000-0000000000d1',
  'test-issue308-delete',
  'test-issue308-delete@example.com',
  1, NULL,
  '2026-05-29T00:00:00.000Z',
  '2026-05-29T00:00:00.000Z',
  'test-issue308-delete', NULL,
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
  '01999308-0000-7000-8000-0000000000d2',
  '01999308-0000-7000-8000-0000000000d1',
  '01999308-0000-7000-8000-0000000000d1',
  'credential',
  'pbkdf2-sha256-v1$600000$hWWS9gy+aK+FNw7f8FIRGg==$DylHzhVqbTG2tCfxVq6beQray8+nfQOOdk24qzvgTCk=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-29T00:00:00.000Z',
  '2026-05-29T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01999308-0000-7000-8000-0000000000d3',
  '01999308-0000-7000-8000-0000000000d1',
  NULL, '', '', 0, 0,
  '2026-05-29T00:00:00.000Z',
  '2026-05-29T00:00:00.000Z'
);
