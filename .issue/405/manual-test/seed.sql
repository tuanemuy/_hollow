-- Issue #405 manual-test seed: forged session + saved views (healthy + broken)
DELETE FROM sessions WHERE token = 'manual-test-405-token';
DELETE FROM saved_views WHERE owner_id = '01938f00-0000-7000-8000-000000000001';
DELETE FROM users WHERE id = '01938f00-0000-7000-8000-000000000001';

INSERT INTO users (id, name, email, email_verified, created_at, updated_at, username, role, banned)
VALUES ('01938f00-0000-7000-8000-000000000001', 'Test User 405', 'test-405@example.com', 1,
        '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', 'test405', 'member', 0);

INSERT INTO sessions (id, user_id, token, expires_at, created_at, updated_at)
VALUES ('01938f00-0000-7000-8000-000000000010', '01938f00-0000-7000-8000-000000000001',
        'manual-test-405-token', '2027-12-31T00:00:00.000Z',
        '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

-- Healthy view (empty query)
INSERT INTO saved_views (id, owner_id, name, kind, query_json, display_mode, calendar_date_key, sort_json, is_default, broken_conditions_json, version, created_at, updated_at)
VALUES ('01938f00-0000-7000-8000-0000000000a1', '01938f00-0000-7000-8000-000000000001',
        '全ノート', 'personal',
        '{"directoryId":null,"tagIds":[],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":[]}',
        'list', 'updated', '{"by":"updatedAt","direction":"desc"}', 1, '[]', 0,
        '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');

-- Broken view: references a deleted directory, with snapshotted lastSeenName
INSERT INTO saved_views (id, owner_id, name, kind, query_json, display_mode, calendar_date_key, sort_json, is_default, broken_conditions_json, version, created_at, updated_at)
VALUES ('01938f00-0000-7000-8000-0000000000a2', '01938f00-0000-7000-8000-000000000001',
        '研究ノート', 'personal',
        '{"directoryId":"01938f00-0000-7000-8000-00000000d111","tagIds":[],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":[]}',
        'tile', 'updated', '{"by":"updatedAt","direction":"desc"}', 0,
        '[{"kind":"directory","id":"01938f00-0000-7000-8000-00000000d111","lastSeenName":"Research / Papers","lastSeenAt":"2026-05-01T00:00:00.000Z"}]',
        0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
