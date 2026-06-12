-- Issue #649 manual-test seed: saved views for dev-admin (idempotent).
-- Owner: dev-admin (01950000-0000-7000-8000-000000000001)
-- Tag ids referenced (existing dev-admin tags with active notes):
--   design   = 01956000-0000-7000-8000-0000000000d1
--   日記     = 019e9900-0000-7000-8000-0000000a0001
--   アイデア = 019e9900-0000-7000-8000-0000000a0002

DELETE FROM saved_views WHERE id IN (
  '01970000-0000-7000-8000-000000649001',
  '01970000-0000-7000-8000-000000649002',
  '01970000-0000-7000-8000-000000649003'
);

INSERT INTO saved_views (
  id, owner_id, name, kind, query_json, display_mode, calendar_date_key,
  sort_json, is_default, broken_conditions_json, version, created_at, updated_at
) VALUES
(
  '01970000-0000-7000-8000-000000649001',
  '01950000-0000-7000-8000-000000000001',
  'テスト用ビュー design',
  'personal',
  '{"directoryId":null,"tagIds":["01956000-0000-7000-8000-0000000000d1"],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":[]}',
  'list',
  'updated',
  '{"by":"updatedAt","direction":"desc"}',
  0, '[]', 0,
  '2026-06-12T00:00:00.000Z', '2026-06-12T00:00:00.000Z'
),
(
  '01970000-0000-7000-8000-000000649002',
  '01950000-0000-7000-8000-000000000001',
  'テスト用タイル日記',
  'personal',
  '{"directoryId":null,"tagIds":["019e9900-0000-7000-8000-0000000a0001"],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":[]}',
  'tile',
  'updated',
  '{"by":"updatedAt","direction":"desc"}',
  0, '[]', 0,
  '2026-06-12T00:00:00.000Z', '2026-06-12T00:00:00.000Z'
),
(
  '01970000-0000-7000-8000-000000649003',
  '01950000-0000-7000-8000-000000000001',
  'TestLongViewName649AAAAABBBBBCCCCCDDDDDEEEEE12345',
  'personal',
  '{"directoryId":null,"tagIds":["019e9900-0000-7000-8000-0000000a0002"],"dateRange":null,"keyword":null,"referencingNoteId":null,"visibilityFilter":[]}',
  'list',
  'updated',
  '{"by":"updatedAt","direction":"desc"}',
  0, '[]', 0,
  '2026-06-12T00:00:00.000Z', '2026-06-12T00:00:00.000Z'
);
