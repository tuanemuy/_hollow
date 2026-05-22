-- Issue #96 supplemental seed.
-- Adds a non-admin user with the literal email mailowner@example.com
-- that testing.md (#96) references for the general-user flow check.
--
-- Password hash is for `Password123!`, reusing the value from baseline
-- seed (.manual-test/2026-05-17/seed.sql) where it is verified to work
-- against app/core/adapters/d1/repositories/credentialStore.ts.
--
-- IDs use a dedicated prefix (01938f96-*) to avoid colliding with the
-- baseline seed (01938f00-* / 01938f01-*).

INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username,
  role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01938f96-0000-7000-8000-000000000001',
  'mailowner-issue96',
  'mailowner@example.com',
  1,
  NULL,
  '2026-05-20T00:00:00.000Z',
  '2026-05-20T00:00:00.000Z',
  'mailowner-issue96',
  NULL,
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
  '01938f96-0000-7000-8000-000000000002',
  '01938f96-0000-7000-8000-000000000001',
  '01938f96-0000-7000-8000-000000000001',
  'credential',
  'pbkdf2-sha256-v1$600000$ebPdv6QFRoC3uvrsizF2QQ==$PTLPnWJtL1ml8X+oTrO47Qoa9fLMdaGrjnbYMe4y/VQ=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-20T00:00:00.000Z',
  '2026-05-20T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f96-0000-7000-8000-000000000003',
  '01938f96-0000-7000-8000-000000000001',
  NULL, '', '', 0, 0,
  '2026-05-20T00:00:00.000Z',
  '2026-05-20T00:00:00.000Z'
);
