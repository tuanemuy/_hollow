DELETE FROM sessions WHERE token = 'dev-tester-session-token' OR user_id = '01950000-0000-7000-8000-000000000011';
DELETE FROM users WHERE (email = 'dev-tester@example.com' OR username = 'dev-tester') AND id <> '01950000-0000-7000-8000-000000000011';
INSERT INTO users (id, name, email, email_verified, image, created_at, updated_at, username, display_username, role, banned, ban_reason, ban_expires, bio, avatar_media_id, last_username_changed_at, deleted_at)
VALUES ('01950000-0000-7000-8000-000000000011', 'Dev Tester', 'dev-tester@example.com', 1, NULL, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z', 'dev-tester', NULL, 'member', 0, NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT(id) DO UPDATE SET email_verified=1, banned=0, deleted_at=NULL, role='member';
INSERT INTO sessions (id, user_id, token, expires_at, created_at, updated_at, ip_address, user_agent, impersonated_by)
VALUES ('01950000-0000-7000-8000-000000000012', '01950000-0000-7000-8000-000000000011', 'dev-tester-session-token', '2999-12-31T23:59:59.000Z', '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z', NULL, NULL, NULL);
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
SELECT '01950000-0000-7000-8000-000000000658', '01950000-0000-7000-8000-000000000001', NULL, '', '', 0, 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z'
WHERE NOT EXISTS (SELECT 1 FROM directories WHERE owner_id = '01950000-0000-7000-8000-000000000001' AND parent_id IS NULL);
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000101', '01950000-0000-7000-8000-000000000001', 'test-tag-01', 'test-tag-01', 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z')
ON CONFLICT DO NOTHING;
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000102', '01950000-0000-7000-8000-000000000001', 'test-tag-02', 'test-tag-02', 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z')
ON CONFLICT DO NOTHING;
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000103', '01950000-0000-7000-8000-000000000001', 'test-tag-03', 'test-tag-03', 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z')
ON CONFLICT DO NOTHING;
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000104', '01950000-0000-7000-8000-000000000001', 'test-tag-04', 'test-tag-04', 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z')
ON CONFLICT DO NOTHING;
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000105', '01950000-0000-7000-8000-000000000001', 'test-tag-05', 'test-tag-05', 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z')
ON CONFLICT DO NOTHING;
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000106', '01950000-0000-7000-8000-000000000001', 'test-tag-06', 'test-tag-06', 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z')
ON CONFLICT DO NOTHING;
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000107', '01950000-0000-7000-8000-000000000001', 'test-tag-07', 'test-tag-07', 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z')
ON CONFLICT DO NOTHING;
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000108', '01950000-0000-7000-8000-000000000001', 'test-tag-08', 'test-tag-08', 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z')
ON CONFLICT DO NOTHING;
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000109', '01950000-0000-7000-8000-000000000001', 'test-tag-09', 'test-tag-09', 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z')
ON CONFLICT DO NOTHING;
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000110', '01950000-0000-7000-8000-000000000001', 'test-tag-10', 'test-tag-10', 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z')
ON CONFLICT DO NOTHING;
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000111', '01950000-0000-7000-8000-000000000001', 'test-tag-11', 'test-tag-11', 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z')
ON CONFLICT DO NOTHING;
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000112', '01950000-0000-7000-8000-000000000001', 'test-tag-12', 'test-tag-12', 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z')
ON CONFLICT DO NOTHING;
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000113', '01950000-0000-7000-8000-000000000001', 'test-tag-13', 'test-tag-13', 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z')
ON CONFLICT DO NOTHING;
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01950000-0000-7000-8000-000000000114', '01950000-0000-7000-8000-000000000001', 'test-tag-14', 'test-tag-14', 0, '2026-06-13T00:00:00.000Z', '2026-06-13T00:00:00.000Z')
ON CONFLICT DO NOTHING;
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
SELECT '01950000-0000-7000-8000-000000000201', '01950000-0000-7000-8000-000000000001', (SELECT id FROM directories WHERE owner_id='01950000-0000-7000-8000-000000000001' AND parent_id IS NULL), 'test-note-01', 'Test Note 01', '<h1>Test Note 01</h1><p>Seed note for Issue #658 tag picker testing. Tag: #test-tag-01</p>', '{}', 'active', NULL, '2026-06-01T00:01:00.000Z', '2026-06-01T00:01:00.000Z', 0
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE owner_id='01950000-0000-7000-8000-000000000001' AND slug='test-note-01' AND status='active');
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-01' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-01' ON CONFLICT DO NOTHING;
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
SELECT '01950000-0000-7000-8000-000000000202', '01950000-0000-7000-8000-000000000001', (SELECT id FROM directories WHERE owner_id='01950000-0000-7000-8000-000000000001' AND parent_id IS NULL), 'test-note-02', 'Test Note 02', '<h1>Test Note 02</h1><p>Seed note for Issue #658 tag picker testing. Tag: #test-tag-02</p>', '{}', 'active', NULL, '2026-06-01T00:02:00.000Z', '2026-06-01T00:02:00.000Z', 0
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE owner_id='01950000-0000-7000-8000-000000000001' AND slug='test-note-02' AND status='active');
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-02' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-02' ON CONFLICT DO NOTHING;
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
SELECT '01950000-0000-7000-8000-000000000203', '01950000-0000-7000-8000-000000000001', (SELECT id FROM directories WHERE owner_id='01950000-0000-7000-8000-000000000001' AND parent_id IS NULL), 'test-note-03', 'Test Note 03', '<h1>Test Note 03</h1><p>Seed note for Issue #658 tag picker testing. Tag: #test-tag-03</p>', '{}', 'active', NULL, '2026-06-01T00:03:00.000Z', '2026-06-01T00:03:00.000Z', 0
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE owner_id='01950000-0000-7000-8000-000000000001' AND slug='test-note-03' AND status='active');
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-03' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-03' ON CONFLICT DO NOTHING;
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
SELECT '01950000-0000-7000-8000-000000000204', '01950000-0000-7000-8000-000000000001', (SELECT id FROM directories WHERE owner_id='01950000-0000-7000-8000-000000000001' AND parent_id IS NULL), 'test-note-04', 'Test Note 04', '<h1>Test Note 04</h1><p>Seed note for Issue #658 tag picker testing. Tag: #test-tag-04</p>', '{}', 'active', NULL, '2026-06-01T00:04:00.000Z', '2026-06-01T00:04:00.000Z', 0
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE owner_id='01950000-0000-7000-8000-000000000001' AND slug='test-note-04' AND status='active');
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-04' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-04' ON CONFLICT DO NOTHING;
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
SELECT '01950000-0000-7000-8000-000000000205', '01950000-0000-7000-8000-000000000001', (SELECT id FROM directories WHERE owner_id='01950000-0000-7000-8000-000000000001' AND parent_id IS NULL), 'test-note-05', 'Test Note 05', '<h1>Test Note 05</h1><p>Seed note for Issue #658 tag picker testing. Tag: #test-tag-05</p>', '{}', 'active', NULL, '2026-06-01T00:05:00.000Z', '2026-06-01T00:05:00.000Z', 0
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE owner_id='01950000-0000-7000-8000-000000000001' AND slug='test-note-05' AND status='active');
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-05' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-05' ON CONFLICT DO NOTHING;
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
SELECT '01950000-0000-7000-8000-000000000206', '01950000-0000-7000-8000-000000000001', (SELECT id FROM directories WHERE owner_id='01950000-0000-7000-8000-000000000001' AND parent_id IS NULL), 'test-note-06', 'Test Note 06', '<h1>Test Note 06</h1><p>Seed note for Issue #658 tag picker testing. Tag: #test-tag-06</p>', '{}', 'active', NULL, '2026-06-01T00:06:00.000Z', '2026-06-01T00:06:00.000Z', 0
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE owner_id='01950000-0000-7000-8000-000000000001' AND slug='test-note-06' AND status='active');
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-06' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-06' ON CONFLICT DO NOTHING;
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
SELECT '01950000-0000-7000-8000-000000000207', '01950000-0000-7000-8000-000000000001', (SELECT id FROM directories WHERE owner_id='01950000-0000-7000-8000-000000000001' AND parent_id IS NULL), 'test-note-07', 'Test Note 07', '<h1>Test Note 07</h1><p>Seed note for Issue #658 tag picker testing. Tag: #test-tag-07</p>', '{}', 'active', NULL, '2026-06-01T00:07:00.000Z', '2026-06-01T00:07:00.000Z', 0
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE owner_id='01950000-0000-7000-8000-000000000001' AND slug='test-note-07' AND status='active');
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-07' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-07' ON CONFLICT DO NOTHING;
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
SELECT '01950000-0000-7000-8000-000000000208', '01950000-0000-7000-8000-000000000001', (SELECT id FROM directories WHERE owner_id='01950000-0000-7000-8000-000000000001' AND parent_id IS NULL), 'test-note-08', 'Test Note 08', '<h1>Test Note 08</h1><p>Seed note for Issue #658 tag picker testing. Tag: #test-tag-08</p>', '{}', 'active', NULL, '2026-06-01T00:08:00.000Z', '2026-06-01T00:08:00.000Z', 0
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE owner_id='01950000-0000-7000-8000-000000000001' AND slug='test-note-08' AND status='active');
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-08' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-08' ON CONFLICT DO NOTHING;
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
SELECT '01950000-0000-7000-8000-000000000209', '01950000-0000-7000-8000-000000000001', (SELECT id FROM directories WHERE owner_id='01950000-0000-7000-8000-000000000001' AND parent_id IS NULL), 'test-note-09', 'Test Note 09', '<h1>Test Note 09</h1><p>Seed note for Issue #658 tag picker testing. Tag: #test-tag-09</p>', '{}', 'active', NULL, '2026-06-01T00:09:00.000Z', '2026-06-01T00:09:00.000Z', 0
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE owner_id='01950000-0000-7000-8000-000000000001' AND slug='test-note-09' AND status='active');
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-09' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-09' ON CONFLICT DO NOTHING;
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
SELECT '01950000-0000-7000-8000-000000000210', '01950000-0000-7000-8000-000000000001', (SELECT id FROM directories WHERE owner_id='01950000-0000-7000-8000-000000000001' AND parent_id IS NULL), 'test-note-10', 'Test Note 10', '<h1>Test Note 10</h1><p>Seed note for Issue #658 tag picker testing. Tag: #test-tag-10</p>', '{}', 'active', NULL, '2026-06-01T00:10:00.000Z', '2026-06-01T00:10:00.000Z', 0
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE owner_id='01950000-0000-7000-8000-000000000001' AND slug='test-note-10' AND status='active');
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-10' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-10' ON CONFLICT DO NOTHING;
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
SELECT '01950000-0000-7000-8000-000000000211', '01950000-0000-7000-8000-000000000001', (SELECT id FROM directories WHERE owner_id='01950000-0000-7000-8000-000000000001' AND parent_id IS NULL), 'test-note-11', 'Test Note 11', '<h1>Test Note 11</h1><p>Seed note for Issue #658 tag picker testing. Tag: #test-tag-11</p>', '{}', 'active', NULL, '2026-06-01T00:11:00.000Z', '2026-06-01T00:11:00.000Z', 0
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE owner_id='01950000-0000-7000-8000-000000000001' AND slug='test-note-11' AND status='active');
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-11' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-11' ON CONFLICT DO NOTHING;
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
SELECT '01950000-0000-7000-8000-000000000212', '01950000-0000-7000-8000-000000000001', (SELECT id FROM directories WHERE owner_id='01950000-0000-7000-8000-000000000001' AND parent_id IS NULL), 'test-note-12', 'Test Note 12', '<h1>Test Note 12</h1><p>Seed note for Issue #658 tag picker testing. Tag: #test-tag-12</p>', '{}', 'active', NULL, '2026-06-01T00:12:00.000Z', '2026-06-01T00:12:00.000Z', 0
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE owner_id='01950000-0000-7000-8000-000000000001' AND slug='test-note-12' AND status='active');
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-12' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-12' ON CONFLICT DO NOTHING;
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
SELECT '01950000-0000-7000-8000-000000000213', '01950000-0000-7000-8000-000000000001', (SELECT id FROM directories WHERE owner_id='01950000-0000-7000-8000-000000000001' AND parent_id IS NULL), 'test-note-13', 'Test Note 13', '<h1>Test Note 13</h1><p>Seed note for Issue #658 tag picker testing. Tag: #test-tag-13</p>', '{}', 'active', NULL, '2026-06-01T00:13:00.000Z', '2026-06-01T00:13:00.000Z', 0
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE owner_id='01950000-0000-7000-8000-000000000001' AND slug='test-note-13' AND status='active');
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-13' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-13' ON CONFLICT DO NOTHING;
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
SELECT '01950000-0000-7000-8000-000000000214', '01950000-0000-7000-8000-000000000001', (SELECT id FROM directories WHERE owner_id='01950000-0000-7000-8000-000000000001' AND parent_id IS NULL), 'test-note-14', 'Test Note 14', '<h1>Test Note 14</h1><p>Seed note for Issue #658 tag picker testing. Tag: #test-tag-14</p>', '{}', 'active', NULL, '2026-06-01T00:14:00.000Z', '2026-06-01T00:14:00.000Z', 0
WHERE NOT EXISTS (SELECT 1 FROM notes WHERE owner_id='01950000-0000-7000-8000-000000000001' AND slug='test-note-14' AND status='active');
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-14' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-14' ON CONFLICT DO NOTHING;
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-01' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-02' ON CONFLICT DO NOTHING;
INSERT INTO note_tags (note_id, tag_id) SELECT n.id, t.id FROM notes n, tags t WHERE n.owner_id='01950000-0000-7000-8000-000000000001' AND n.slug='test-note-01' AND n.status='active' AND t.owner_id='01950000-0000-7000-8000-000000000001' AND t.name_normalized='test-tag-03' ON CONFLICT DO NOTHING;
