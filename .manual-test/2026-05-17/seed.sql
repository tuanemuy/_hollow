-- Manual-test baseline seed (2026-05-17)
--
-- 12 accounts referenced by spec/manual-tests/*.md:
--   - 3 baseline accounts (NEVER mutated by any TC): existing-user, mailowner,
--     admin-user. Used for login + as collision targets.
--   - 6 throwaway accounts (consumed by exactly one destructive TC each):
--     tc-rename-a/b/c, tc-delete-a, tc-email-a/b, tc-password-a.
--   - 2 pre-state accounts: tc-unverified (email_verified=0),
--     tc-suspended (banned=1).
--
-- All credential rows share the password "Password123!" hashed with
-- PBKDF2-SHA256 / 600_000 iterations to match
-- app/core/adapters/d1/repositories/credentialStore.ts.
-- Hashes regenerated via .manual-test/2026-05-17/hashPassword.mjs.
--
-- Each row uses INSERT OR IGNORE keyed off PRIMARY KEY (id) so re-running
-- the script is safe. Per-owner root directory is provisioned because
-- signUp's DirectoryService.ensureRoot is bypassed by this direct insert.
-- To restore a clean state after destructive TCs run, use reseed.sh (which
-- deletes seeded rows by ID and re-runs this file).

-- ===========================================================================
-- BASELINE — do not mutate
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- existing-user (member, login target + username-collision target)
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username,
  role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01938f00-0000-7000-8000-0000000000a1',
  'existing-user',
  'existing@example.com',
  1,
  NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z',
  'existing-user',
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
  '01938f00-0000-7000-8000-0000000000a2',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f00-0000-7000-8000-0000000000a1',
  'credential',
  'pbkdf2-sha256-v1$600000$8Bc1tGRJEWixJNKzq4v94Q==$MaUwLu0eAwZxKrhdpHL9V5RIN5fx8VAEzmR/Yn6KQtY=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f00-0000-7000-8000-0000000000a3',
  '01938f00-0000-7000-8000-0000000000a1',
  NULL, '', '', 0, 0,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

-- ---------------------------------------------------------------------------
-- mailowner (member, owns existing-new@example.com for email-collision tests)
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username,
  role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01938f00-0000-7000-8000-0000000000b1',
  'mailowner',
  'existing-new@example.com',
  1,
  NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z',
  'mailowner',
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
  '01938f00-0000-7000-8000-0000000000b2',
  '01938f00-0000-7000-8000-0000000000b1',
  '01938f00-0000-7000-8000-0000000000b1',
  'credential',
  'pbkdf2-sha256-v1$600000$ebPdv6QFRoC3uvrsizF2QQ==$PTLPnWJtL1ml8X+oTrO47Qoa9fLMdaGrjnbYMe4y/VQ=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f00-0000-7000-8000-0000000000b3',
  '01938f00-0000-7000-8000-0000000000b1',
  NULL, '', '', 0, 0,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

-- ---------------------------------------------------------------------------
-- admin-user (admin role)
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username,
  role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01938f00-0000-7000-8000-0000000000c1',
  'admin-user',
  'admin@example.com',
  1,
  NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z',
  'admin-user',
  NULL,
  'admin',
  0, NULL, NULL,
  NULL, NULL, NULL, NULL
);

INSERT OR IGNORE INTO accounts (
  id, user_id, account_id, provider_id,
  password, access_token, refresh_token, id_token,
  access_token_expires_at, refresh_token_expires_at, scope,
  created_at, updated_at
) VALUES (
  '01938f00-0000-7000-8000-0000000000c2',
  '01938f00-0000-7000-8000-0000000000c1',
  '01938f00-0000-7000-8000-0000000000c1',
  'credential',
  'pbkdf2-sha256-v1$600000$Ev8n4055EPh2nLFfcfoZLg==$JcALLZDLVtvblQdEwN30lCUFCUbXodMuCp5r3jsWr70=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f00-0000-7000-8000-0000000000c3',
  '01938f00-0000-7000-8000-0000000000c1',
  NULL, '', '', 0, 0,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

-- ===========================================================================
-- THROWAWAY — each consumed by exactly one destructive TC
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- tc-rename-a — TC-A4-02 (ユーザー名変更, rename to tc-rename-a-renamed)
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username,
  role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01938f01-0000-7000-8000-000000000011',
  'tc-rename-a',
  'tc-rename-a@example.com',
  1, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z',
  'tc-rename-a', NULL,
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
  '01938f01-0000-7000-8000-000000000012',
  '01938f01-0000-7000-8000-000000000011',
  '01938f01-0000-7000-8000-000000000011',
  'credential',
  'pbkdf2-sha256-v1$600000$p0bFnbUAjCgUkINpmbWIBA==$QaD+ZX7h3LmraUEIk+OpoO3R2a+yF6KCofzNDeDE5H8=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f01-0000-7000-8000-000000000013',
  '01938f01-0000-7000-8000-000000000011',
  NULL, '', '', 0, 0,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

-- ---------------------------------------------------------------------------
-- tc-rename-b — TC-A4-03 (login as this; rename target is existing-user)
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username,
  role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01938f01-0000-7000-8000-000000000021',
  'tc-rename-b',
  'tc-rename-b@example.com',
  1, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z',
  'tc-rename-b', NULL,
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
  '01938f01-0000-7000-8000-000000000022',
  '01938f01-0000-7000-8000-000000000021',
  '01938f01-0000-7000-8000-000000000021',
  'credential',
  'pbkdf2-sha256-v1$600000$IketXCo7rmRBHD2Jro4WAg==$hl2FuxINhccmLoKSxTjDod3Hv+VTw+KldhcCpz2b/8Y=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f01-0000-7000-8000-000000000023',
  '01938f01-0000-7000-8000-000000000021',
  NULL, '', '', 0, 0,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

-- ---------------------------------------------------------------------------
-- tc-rename-c — TC-A4-05 (rate limit, renamed twice)
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username,
  role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01938f01-0000-7000-8000-000000000031',
  'tc-rename-c',
  'tc-rename-c@example.com',
  1, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z',
  'tc-rename-c', NULL,
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
  '01938f01-0000-7000-8000-000000000032',
  '01938f01-0000-7000-8000-000000000031',
  '01938f01-0000-7000-8000-000000000031',
  'credential',
  'pbkdf2-sha256-v1$600000$b4MC/SOj6TVMIDZGRlEh8w==$LtdYK7j3jhvu35V5vl33Xnal62MJZKlg69UuTMTB1TM=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f01-0000-7000-8000-000000000033',
  '01938f01-0000-7000-8000-000000000031',
  NULL, '', '', 0, 0,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

-- ---------------------------------------------------------------------------
-- tc-delete-a — TC-A5-01 (account deletion)
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username,
  role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01938f01-0000-7000-8000-000000000041',
  'tc-delete-a',
  'tc-delete-a@example.com',
  1, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z',
  'tc-delete-a', NULL,
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
  '01938f01-0000-7000-8000-000000000042',
  '01938f01-0000-7000-8000-000000000041',
  '01938f01-0000-7000-8000-000000000041',
  'credential',
  'pbkdf2-sha256-v1$600000$WE+IzuNXOqb5fzmayNybXw==$nMqNiNuOAZZMRX+oGNbWUd2ZN0fnXp7lYOxI2d4Xekc=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f01-0000-7000-8000-000000000043',
  '01938f01-0000-7000-8000-000000000041',
  NULL, '', '', 0, 0,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

-- ---------------------------------------------------------------------------
-- tc-email-a — TC-A6-01 (email change success)
-- Change target: tc-email-a-new@example.com (a fresh, unowned address)
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username,
  role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01938f01-0000-7000-8000-000000000051',
  'tc-email-a',
  'tc-email-a@example.com',
  1, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z',
  'tc-email-a', NULL,
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
  '01938f01-0000-7000-8000-000000000052',
  '01938f01-0000-7000-8000-000000000051',
  '01938f01-0000-7000-8000-000000000051',
  'credential',
  'pbkdf2-sha256-v1$600000$kuxiO7azWKTEq16GATWuuw==$iarHUMn2WZHiGr3ZwGb8BRrWI1pT5uDM+7nH52c/rOg=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f01-0000-7000-8000-000000000053',
  '01938f01-0000-7000-8000-000000000051',
  NULL, '', '', 0, 0,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

-- ---------------------------------------------------------------------------
-- tc-email-b — TC-A6-04 (email change rate limit)
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username,
  role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01938f01-0000-7000-8000-000000000061',
  'tc-email-b',
  'tc-email-b@example.com',
  1, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z',
  'tc-email-b', NULL,
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
  '01938f01-0000-7000-8000-000000000062',
  '01938f01-0000-7000-8000-000000000061',
  '01938f01-0000-7000-8000-000000000061',
  'credential',
  'pbkdf2-sha256-v1$600000$iWTDFMA+097zIlb4Gm9FpA==$YpgviowaGQ2Nja58EM5hqX9uGhGxlSuoZWgBaWR3Ng4=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f01-0000-7000-8000-000000000063',
  '01938f01-0000-7000-8000-000000000061',
  NULL, '', '', 0, 0,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

-- ---------------------------------------------------------------------------
-- tc-password-a — TC-A3-01 (password change success)
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username,
  role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01938f01-0000-7000-8000-000000000071',
  'tc-password-a',
  'tc-password-a@example.com',
  1, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z',
  'tc-password-a', NULL,
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
  '01938f01-0000-7000-8000-000000000072',
  '01938f01-0000-7000-8000-000000000071',
  '01938f01-0000-7000-8000-000000000071',
  'credential',
  'pbkdf2-sha256-v1$600000$KxWy7EE6/qDw04MtIEfwMQ==$41bwQcPGTXFuylFPbe/Lx+N3J1aE9Nimk3wu5uVEHAo=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f01-0000-7000-8000-000000000073',
  '01938f01-0000-7000-8000-000000000071',
  NULL, '', '', 0, 0,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

-- ===========================================================================
-- PRE-STATE — accounts intentionally created in non-active states
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- tc-unverified — TC-A2-03 (email_verified=0, pending login)
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username,
  role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01938f01-0000-7000-8000-000000000081',
  'tc-unverified',
  'tc-unverified@example.com',
  0, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z',
  'tc-unverified', NULL,
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
  '01938f01-0000-7000-8000-000000000082',
  '01938f01-0000-7000-8000-000000000081',
  '01938f01-0000-7000-8000-000000000081',
  'credential',
  'pbkdf2-sha256-v1$600000$p5P+UhcWZHYnZgptpS6aew==$kKGpbo7LSe5TnxR7R+RtMxuYQhLJdigvsrGf8IypVLo=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f01-0000-7000-8000-000000000083',
  '01938f01-0000-7000-8000-000000000081',
  NULL, '', '', 0, 0,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

-- ---------------------------------------------------------------------------
-- tc-suspended — TC-A2-04 (banned=1, banned account)
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO users (
  id, name, email, email_verified, image,
  created_at, updated_at,
  username, display_username,
  role, banned, ban_reason, ban_expires,
  bio, avatar_media_id, last_username_changed_at, deleted_at
) VALUES (
  '01938f01-0000-7000-8000-000000000091',
  'tc-suspended',
  'tc-suspended@example.com',
  1, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z',
  'tc-suspended', NULL,
  'member',
  1, 'manual-test: pre-state for TC-A2-04', NULL,
  NULL, NULL, NULL, NULL
);

INSERT OR IGNORE INTO accounts (
  id, user_id, account_id, provider_id,
  password, access_token, refresh_token, id_token,
  access_token_expires_at, refresh_token_expires_at, scope,
  created_at, updated_at
) VALUES (
  '01938f01-0000-7000-8000-000000000092',
  '01938f01-0000-7000-8000-000000000091',
  '01938f01-0000-7000-8000-000000000091',
  'credential',
  'pbkdf2-sha256-v1$600000$M1mOzHhLB/MxlSeY7U0EjA==$n3eHViM8SJSH4ME30zmkY5HTUZL00XScxPIpTzCh/h0=',
  NULL, NULL, NULL, NULL, NULL, NULL,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);

INSERT OR IGNORE INTO directories (
  id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at
) VALUES (
  '01938f01-0000-7000-8000-000000000093',
  '01938f01-0000-7000-8000-000000000091',
  NULL, '', '', 0, 0,
  '2026-05-17T00:00:00.000Z',
  '2026-05-17T00:00:00.000Z'
);
