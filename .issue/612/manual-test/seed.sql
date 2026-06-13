-- Seed for Issue #612 manual browser verification.
-- Local D1 only. Idempotent: deletes its own fixed-id rows first, then inserts.
-- All ids use the 01970000-... prefix (valid UUIDv7) reserved for this seed,
-- so they never collide with existing local data or the #605 seed (01960000-).
--
-- Goal: reproduce the relay-lag "trashed-but-public" overcount bug (#612).
--   Owner user `noteowner612` has:
--     - 4 notes that are active + public + published_at NOT NULL  → counted
--     - 1 note trashed but its publication_states row left public + published_at
--       NOT NULL (relay-lag ghost)                                → must be excluded
--     - 1 note public but published_at IS NULL (anomaly, exclusion check) → excluded
--   Expected: hero publicNoteCount == listing total == 4.
--
-- Reference "now" = 2026-06-13 (today).

-- ----- cleanup (children first; FTS auto-syncs via triggers on delete) -----
DELETE FROM publication_states WHERE note_id LIKE '01970000-%';
DELETE FROM search_documents   WHERE note_id LIKE '01970000-%';
DELETE FROM notes              WHERE id      LIKE '01970000-%';
DELETE FROM directories        WHERE id      LIKE '01970000-%';
DELETE FROM users              WHERE id      LIKE '01970000-%';

-- ----- test user (username MUST be lowercase [a-z0-9-]) -----
INSERT INTO users (id, name, email, email_verified, created_at, updated_at, username, role, banned)
VALUES
 ('01970000-0000-7000-8000-000000000001','Note Owner 612','noteowner612@example.com',1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z','noteowner612','member',0);

-- ----- root directory (depth 0) -----
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES
 ('01970000-0000-7000-8000-0000000000d1','01970000-0000-7000-8000-000000000001',NULL,'root','',0,0,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z');

-- ----- active notes (the 4 that should be counted) -----
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, created_at, updated_at, version)
VALUES
 ('01970000-0000-7000-8000-0000000000a1','01970000-0000-7000-8000-000000000001','01970000-0000-7000-8000-0000000000d1','note-one','Note One','<p>note one body</p>','{}','active','2025-01-10T00:00:00.000Z','2026-06-10T00:00:00.000Z',0),
 ('01970000-0000-7000-8000-0000000000a2','01970000-0000-7000-8000-000000000001','01970000-0000-7000-8000-0000000000d1','note-two','Note Two','<p>note two body</p>','{}','active','2025-01-10T00:00:00.000Z','2026-06-09T00:00:00.000Z',0),
 ('01970000-0000-7000-8000-0000000000a3','01970000-0000-7000-8000-000000000001','01970000-0000-7000-8000-0000000000d1','note-three','Note Three','<p>note three body</p>','{}','active','2025-01-10T00:00:00.000Z','2026-06-08T00:00:00.000Z',0),
 ('01970000-0000-7000-8000-0000000000a4','01970000-0000-7000-8000-000000000001','01970000-0000-7000-8000-0000000000d1','note-four','Note Four','<p>note four body</p>','{}','active','2025-01-10T00:00:00.000Z','2026-06-07T00:00:00.000Z',0),
 -- anomaly: active + public but published_at IS NULL → must be excluded from count/listing
 ('01970000-0000-7000-8000-0000000000a6','01970000-0000-7000-8000-000000000001','01970000-0000-7000-8000-0000000000d1','note-nullpub','Note Null Pub','<p>null pub body</p>','{}','active','2025-01-10T00:00:00.000Z','2026-06-05T00:00:00.000Z',0);

-- ----- trashed-but-public note (relay lag). Separate INSERT to set trashed_at.
-- Domain invariant: a trashed note MUST carry a non-null trashed_at.
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
VALUES
 ('01970000-0000-7000-8000-0000000000a5','01970000-0000-7000-8000-000000000001','01970000-0000-7000-8000-0000000000d1','note-ghost','Trashed Ghost Note','<p>ghost body</p>','{}','trashed','2026-06-12T00:00:00.000Z','2025-01-10T00:00:00.000Z','2026-06-12T00:00:00.000Z',0);

-- ----- publication_states (active JOIN + visibility public gate) -----
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version)
VALUES
 ('01970000-0000-7000-8000-0000000000a1','01970000-0000-7000-8000-000000000001','public','2026-06-10T00:00:00.000Z','2026-06-10T00:00:00.000Z',0),
 ('01970000-0000-7000-8000-0000000000a2','01970000-0000-7000-8000-000000000001','public','2026-06-09T00:00:00.000Z','2026-06-09T00:00:00.000Z',0),
 ('01970000-0000-7000-8000-0000000000a3','01970000-0000-7000-8000-000000000001','public','2026-06-08T00:00:00.000Z','2026-06-08T00:00:00.000Z',0),
 ('01970000-0000-7000-8000-0000000000a4','01970000-0000-7000-8000-000000000001','public','2026-06-07T00:00:00.000Z','2026-06-07T00:00:00.000Z',0),
 -- trashed-but-public (relay lag): visibility stays public, published_at NOT NULL
 ('01970000-0000-7000-8000-0000000000a5','01970000-0000-7000-8000-000000000001','public','2026-06-06T00:00:00.000Z','2026-06-06T00:00:00.000Z',0),
 -- anomaly: public + published_at NULL
 ('01970000-0000-7000-8000-0000000000a6','01970000-0000-7000-8000-000000000001','public',NULL,'2026-06-05T00:00:00.000Z',0);

-- ----- search_documents (FTS triggers auto-populate search_documents_fts) -----
-- Only the 4 valid active+public notes are indexed as public (matches relay output).
INSERT INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at)
VALUES
 ('01970000-0000-7000-8000-0000000000a1','01970000-0000-7000-8000-000000000001','public','Note One','note one body','[]','','2026-06-10T00:00:00.000Z','2026-06-10T00:00:00.000Z','2026-06-10T00:00:00.000Z'),
 ('01970000-0000-7000-8000-0000000000a2','01970000-0000-7000-8000-000000000001','public','Note Two','note two body','[]','','2026-06-09T00:00:00.000Z','2026-06-09T00:00:00.000Z','2026-06-09T00:00:00.000Z'),
 ('01970000-0000-7000-8000-0000000000a3','01970000-0000-7000-8000-000000000001','public','Note Three','note three body','[]','','2026-06-08T00:00:00.000Z','2026-06-08T00:00:00.000Z','2026-06-08T00:00:00.000Z'),
 ('01970000-0000-7000-8000-0000000000a4','01970000-0000-7000-8000-000000000001','public','Note Four','note four body','[]','','2026-06-07T00:00:00.000Z','2026-06-07T00:00:00.000Z','2026-06-07T00:00:00.000Z');
