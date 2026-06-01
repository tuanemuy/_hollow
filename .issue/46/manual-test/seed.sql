-- Issue #46 manual-test seed
-- Owner: tester46 (019e8175-bbbb-748d-b001-6da3a304e9cb)
-- Root dir: 019e8175-bc81-7417-89de-da0bd3bbf925
--
-- Target note T has 6 active + 1 trashed referrer (= 7 total) to exercise
-- the top-5 preview cap and the total-count display. Lonely note has 0.
-- Idempotent via INSERT OR REPLACE keyed on PK.

-- Target note T
INSERT OR REPLACE INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, created_at, updated_at, version)
VALUES ('019e8200-0000-7000-8000-000000000001','019e8175-bbbb-748d-b001-6da3a304e9cb','019e8175-bc81-7417-89de-da0bd3bbf925','target-note-46','Target Note 46','<p>The target of many backlinks.</p>','{}','active','2026-06-01T09:00:00.000Z','2026-06-01T09:00:00.000Z',0);

-- Lonely note (no referrers)
INSERT OR REPLACE INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, created_at, updated_at, version)
VALUES ('019e8200-0000-7000-8000-000000000002','019e8175-bbbb-748d-b001-6da3a304e9cb','019e8175-bc81-7417-89de-da0bd3bbf925','lonely-note-46','Lonely Note 46','<p>Nobody links here.</p>','{}','active','2026-06-01T09:00:00.000Z','2026-06-01T09:00:00.000Z',0);

-- Active referrers R1..R6 (updated_at increasing; R6 newest)
INSERT OR REPLACE INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, created_at, updated_at, version) VALUES
('019e8200-0000-7000-8000-000000000011','019e8175-bbbb-748d-b001-6da3a304e9cb','019e8175-bc81-7417-89de-da0bd3bbf925','referrer-46-1','Referrer 1','<p>Referrer 1 points at the target note body.</p>','{}','active','2026-06-01T10:00:01.000Z','2026-06-01T10:00:01.000Z',0),
('019e8200-0000-7000-8000-000000000012','019e8175-bbbb-748d-b001-6da3a304e9cb','019e8175-bc81-7417-89de-da0bd3bbf925','referrer-46-2','Referrer 2','<p>Referrer 2 points at the target note body.</p>','{}','active','2026-06-01T10:00:02.000Z','2026-06-01T10:00:02.000Z',0),
('019e8200-0000-7000-8000-000000000013','019e8175-bbbb-748d-b001-6da3a304e9cb','019e8175-bc81-7417-89de-da0bd3bbf925','referrer-46-3','Referrer 3','<p>Referrer 3 points at the target note body.</p>','{}','active','2026-06-01T10:00:03.000Z','2026-06-01T10:00:03.000Z',0),
('019e8200-0000-7000-8000-000000000014','019e8175-bbbb-748d-b001-6da3a304e9cb','019e8175-bc81-7417-89de-da0bd3bbf925','referrer-46-4','Referrer 4','<p>Referrer 4 points at the target note body.</p>','{}','active','2026-06-01T10:00:04.000Z','2026-06-01T10:00:04.000Z',0),
('019e8200-0000-7000-8000-000000000015','019e8175-bbbb-748d-b001-6da3a304e9cb','019e8175-bc81-7417-89de-da0bd3bbf925','referrer-46-5','Referrer 5','<p>Referrer 5 points at the target note body.</p>','{}','active','2026-06-01T10:00:05.000Z','2026-06-01T10:00:05.000Z',0),
('019e8200-0000-7000-8000-000000000016','019e8175-bbbb-748d-b001-6da3a304e9cb','019e8175-bc81-7417-89de-da0bd3bbf925','referrer-46-6','Referrer 6','<p>Referrer 6 points at the target note body.</p>','{}','active','2026-06-01T10:00:06.000Z','2026-06-01T10:00:06.000Z',0);

-- Trashed referrer R7 (newest updated_at; should count + appear in preview top-5)
INSERT OR REPLACE INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
VALUES ('019e8200-0000-7000-8000-000000000017','019e8175-bbbb-748d-b001-6da3a304e9cb','019e8175-bc81-7417-89de-da0bd3bbf925','referrer-46-7','Referrer 7 (trashed)','<p>Trashed referrer still references target.</p>','{}','trashed','2026-06-01T11:00:00.000Z','2026-06-01T10:00:07.000Z','2026-06-01T10:00:07.000Z',0);

-- Resolved internal links: each referrer -> target
INSERT OR REPLACE INTO note_internal_links (id, from_note_id, ref_kind, ref_target, resolved_note_id) VALUES
('019e8201-0000-7000-8000-000000000011','019e8200-0000-7000-8000-000000000011','id','019e8200-0000-7000-8000-000000000001','019e8200-0000-7000-8000-000000000001'),
('019e8201-0000-7000-8000-000000000012','019e8200-0000-7000-8000-000000000012','id','019e8200-0000-7000-8000-000000000001','019e8200-0000-7000-8000-000000000001'),
('019e8201-0000-7000-8000-000000000013','019e8200-0000-7000-8000-000000000013','id','019e8200-0000-7000-8000-000000000001','019e8200-0000-7000-8000-000000000001'),
('019e8201-0000-7000-8000-000000000014','019e8200-0000-7000-8000-000000000014','id','019e8200-0000-7000-8000-000000000001','019e8200-0000-7000-8000-000000000001'),
('019e8201-0000-7000-8000-000000000015','019e8200-0000-7000-8000-000000000015','id','019e8200-0000-7000-8000-000000000001','019e8200-0000-7000-8000-000000000001'),
('019e8201-0000-7000-8000-000000000016','019e8200-0000-7000-8000-000000000016','id','019e8200-0000-7000-8000-000000000001','019e8200-0000-7000-8000-000000000001'),
('019e8201-0000-7000-8000-000000000017','019e8200-0000-7000-8000-000000000017','id','019e8200-0000-7000-8000-000000000001','019e8200-0000-7000-8000-000000000001');
