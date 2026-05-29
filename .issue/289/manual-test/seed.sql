
DELETE FROM directories WHERE owner_id = '019e741a-7f02-7045-80e9-39333564d7d5';
DELETE FROM sessions WHERE user_id = '019e741a-7f02-7045-80e9-39333564d7d5';
DELETE FROM accounts WHERE user_id = '019e741a-7f02-7045-80e9-39333564d7d5';
DELETE FROM users WHERE email = 'e2e-test@example.com';

INSERT INTO users (id, name, email, email_verified, image, created_at, updated_at, username, display_username, role, banned, ban_reason, ban_expires, bio, avatar_media_id, last_username_changed_at, deleted_at)
VALUES ('019e741a-7f02-7045-80e9-39333564d7d5', 'E2E Test User', 'e2e-test@example.com', 1, NULL, '2026-05-29T14:19:14.050Z', '2026-05-29T14:19:14.050Z', 'e2e-test', 'E2E Test User', 'member', 0, NULL, NULL, NULL, NULL, NULL, NULL);

INSERT INTO accounts (id, user_id, account_id, provider_id, password, access_token, refresh_token, id_token, access_token_expires_at, refresh_token_expires_at, scope, created_at, updated_at)
VALUES ('019e741a-7f03-735e-b58e-f9ddbda30246', '019e741a-7f02-7045-80e9-39333564d7d5', '019e741a-7f02-7045-80e9-39333564d7d5', 'credential', '$scrypt$ln=16,r=8,p=1$fBuiZi/md/I+dD79S2tFZA==$PYLE3BeXe4kNjKMsEOGwGNwPR2vuoXVMZsjrTUj2MriJHDrxHY7jueG5vwl8t1xomMZtXcEDNwtcjvP6gR+FWA==', NULL, NULL, NULL, NULL, NULL, NULL, '2026-05-29T14:19:14.050Z', '2026-05-29T14:19:14.050Z');

INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES ('019e741a-7f03-735e-b58e-fe3f5a3f0bd1', '019e741a-7f02-7045-80e9-39333564d7d5', NULL, '', '', 0, 0, '2026-05-29T14:19:14.050Z', '2026-05-29T14:19:14.050Z');

INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES ('019e741a-7f03-735e-b58f-033eecd38191', '019e741a-7f02-7045-80e9-39333564d7d5', '019e741a-7f03-735e-b58e-fe3f5a3f0bd1', 'Projects', 'projects', 1, 0, '2026-05-29T14:19:14.050Z', '2026-05-29T14:19:14.050Z');

INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES ('019e741a-7f03-735e-b58f-07b3ba5ee4de', '019e741a-7f02-7045-80e9-39333564d7d5', '019e741a-7f03-735e-b58f-033eecd38191', 'Frontend', 'frontend', 2, 0, '2026-05-29T14:19:14.050Z', '2026-05-29T14:19:14.050Z');
