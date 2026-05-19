-- Issue #13 manual-test supplemental seed
-- ---------------------------------------------------------------------------
-- Augments the .manual-test/2026-05-17/seed.sql baseline (existing-user, a1)
-- with the data required by .issue/13/testing.md:
--   * an extra sub-directory  (for FilterBar / Sidebar directory tests)
--   * 2 extra tags            (for FilterBar tag-filter / /tags page tests)
--   * 2 trashed notes         (for /trash page + TrashRowActions tests)
--   * publication_states for 5 active notes (private/unlisted/public mix)
--   * note_tags links so tag filters return rows
--
-- Owner: existing-user  (id 01938f00-0000-7000-8000-0000000000a1)
-- All IDs use the 01938f13-... prefix so they never collide with the
-- baseline seed or the reseed.sh DELETE list. Re-running is safe
-- (INSERT OR IGNORE everywhere).
-- ---------------------------------------------------------------------------

-- --- sub-directory under existing-user's root -----------------------------
INSERT OR IGNORE INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES (
  '01938f13-0000-7000-8000-000000000001',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f00-0000-7000-8000-0000000000a3',
  'Issue13 Sub',
  'issue13-sub',
  1,
  0,
  '2026-05-19T00:00:00.000Z',
  '2026-05-19T00:00:00.000Z'
);

-- --- extra tags -----------------------------------------------------------
INSERT OR IGNORE INTO tags (id, owner_id, name, name_normalized, note_count, version, created_at, updated_at)
VALUES
  ('01938f13-0000-7000-8000-000000000101', '01938f00-0000-7000-8000-0000000000a1', 'issue13-alpha', 'issue13-alpha', 0, 0, '2026-05-19T00:00:00.000Z', '2026-05-19T00:00:00.000Z'),
  ('01938f13-0000-7000-8000-000000000102', '01938f00-0000-7000-8000-0000000000a1', 'issue13-beta',  'issue13-beta',  0, 0, '2026-05-19T00:00:00.000Z', '2026-05-19T00:00:00.000Z');

-- --- 2 active notes in the new sub-directory ------------------------------
INSERT OR IGNORE INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, created_at, updated_at, version)
VALUES
  ('01938f13-0000-7000-8000-000000000201',
   '01938f00-0000-7000-8000-0000000000a1',
   '01938f13-0000-7000-8000-000000000001',
   'issue13-sub-note-1',
   'Issue13 Sub Note 1',
   '<p>Issue13 supplemental note 1 (active, in sub-dir).</p>',
   '{}',
   'active',
   '2026-05-19T00:00:00.000Z',
   '2026-05-19T00:00:00.000Z',
   0),
  ('01938f13-0000-7000-8000-000000000202',
   '01938f00-0000-7000-8000-0000000000a1',
   '01938f13-0000-7000-8000-000000000001',
   'issue13-sub-note-2',
   'Issue13 Sub Note 2',
   '<p>Issue13 supplemental note 2 (active, in sub-dir).</p>',
   '{}',
   'active',
   '2026-05-19T00:00:00.000Z',
   '2026-05-19T00:00:00.000Z',
   0);

-- --- 2 trashed notes (for /trash + TrashRowActions) -----------------------
INSERT OR IGNORE INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
VALUES
  ('01938f13-0000-7000-8000-000000000301',
   '01938f00-0000-7000-8000-0000000000a1',
   '01938f00-0000-7000-8000-0000000000a3',
   'issue13-trashed-1',
   'Issue13 Trashed Note 1',
   '<p>Trashed for /trash tests.</p>',
   '{}',
   'trashed',
   '2026-05-19T00:00:00.000Z',
   '2026-05-18T00:00:00.000Z',
   '2026-05-19T00:00:00.000Z',
   0),
  ('01938f13-0000-7000-8000-000000000302',
   '01938f00-0000-7000-8000-0000000000a1',
   '01938f00-0000-7000-8000-0000000000a3',
   'issue13-trashed-2',
   'Issue13 Trashed Note 2',
   '<p>Trashed for /trash tests.</p>',
   '{}',
   'trashed',
   '2026-05-19T00:00:00.000Z',
   '2026-05-18T00:00:00.000Z',
   '2026-05-19T00:00:00.000Z',
   0);

-- --- publication_states (mixed visibility for FilterBar visibility tests) -
-- existing-user active notes from baseline + supplement:
--   01938f32-0000-7000-8000-00000000000a / 0b / 0c  (baseline)
--   019e3a10-68c8-7437-a26e-9b168bffd2c1            (baseline)
--   01938f13-0000-7000-8000-000000000201 / 000202   (supplement)
INSERT OR IGNORE INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version)
VALUES
  ('01938f32-0000-7000-8000-00000000000a', '01938f00-0000-7000-8000-0000000000a1', 'public',   '2026-05-19T00:00:00.000Z', '2026-05-19T00:00:00.000Z', 0),
  ('01938f32-0000-7000-8000-00000000000b', '01938f00-0000-7000-8000-0000000000a1', 'unlisted', '2026-05-19T00:00:00.000Z', '2026-05-19T00:00:00.000Z', 0),
  ('01938f32-0000-7000-8000-00000000000c', '01938f00-0000-7000-8000-0000000000a1', 'private',  NULL,                        '2026-05-19T00:00:00.000Z', 0),
  ('019e3a10-68c8-7437-a26e-9b168bffd2c1', '01938f00-0000-7000-8000-0000000000a1', 'private',  NULL,                        '2026-05-19T00:00:00.000Z', 0),
  ('01938f13-0000-7000-8000-000000000201', '01938f00-0000-7000-8000-0000000000a1', 'public',   '2026-05-19T00:00:00.000Z', '2026-05-19T00:00:00.000Z', 0),
  ('01938f13-0000-7000-8000-000000000202', '01938f00-0000-7000-8000-0000000000a1', 'unlisted', '2026-05-19T00:00:00.000Z', '2026-05-19T00:00:00.000Z', 0);

-- --- note_tags links (so tag filters in FilterBar return rows) ------------
INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES
  ('01938f32-0000-7000-8000-00000000000a', '01938f13-0000-7000-8000-000000000101'),
  ('01938f32-0000-7000-8000-00000000000b', '01938f13-0000-7000-8000-000000000102'),
  ('01938f13-0000-7000-8000-000000000201', '01938f13-0000-7000-8000-000000000101'),
  ('01938f13-0000-7000-8000-000000000202', '01938f13-0000-7000-8000-000000000102'),
  ('01938f13-0000-7000-8000-000000000201', '01938f13-0000-7000-8000-000000000102');

-- Sync note_count on the supplemental tags (initial = 0). Use the actual
-- link count so re-runs converge.
UPDATE tags
  SET note_count = (
    SELECT COUNT(*) FROM note_tags WHERE note_tags.tag_id = tags.id
  )
WHERE id IN (
  '01938f13-0000-7000-8000-000000000101',
  '01938f13-0000-7000-8000-000000000102'
);
