-- Seed for Issue #605 manual browser verification.
-- Local D1 only. Idempotent-ish: deletes its own fixed-id rows first.
-- All ids use the 01960000-... prefix (valid UUIDv7) reserved for this seed,
-- so they never collide with existing local data.
--
-- Reference "now" = 2026-06-09 (today). published_at vs updatedAt are made
-- to disagree on ordering; published_at vs date_for_calendar are made to fall
-- into different period windows.

-- ----- cleanup (children first; FTS auto-syncs via triggers on delete) -----
DELETE FROM publication_states WHERE note_id LIKE '01960000-%';
DELETE FROM search_documents   WHERE note_id LIKE '01960000-%';
DELETE FROM notes              WHERE id      LIKE '01960000-%';
DELETE FROM directories        WHERE id      LIKE '01960000-%';
DELETE FROM users              WHERE id      LIKE '01960000-%';

-- ----- users (username MUST be lowercase) -----
INSERT INTO users (id, name, email, email_verified, created_at, updated_at, username, role, banned)
VALUES
 ('01960000-0000-7000-8000-000000000a01','Alice','alice-605@example.com',1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z','alice','member',0),
 ('01960000-0000-7000-8000-000000000a02','Alicia','alicia-605@example.com',1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z','alicia','member',0),
 ('01960000-0000-7000-8000-000000000b01','Bob','bob-605@example.com',1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z','bob','member',0),
 -- NOTE: usernames are restricted to [a-z0-9-] by the Username value object
 -- (no underscore/%), so the "LIKE special char in stored username" case is
 -- not representable as seed data — it is exercised instead by typing the
 -- literal prefix `a_` into the suggest box (query-side escaping). We keep an
 -- `axb` decoy below to confirm `a_` does not wildcard-match it.
 -- Decoy: prefix 'a' but no public note → must NOT appear in suggest.
 ('01960000-0000-7000-8000-000000000d01','Alfred','alfred-605@example.com',1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z','alfred','member',0),
 -- Decoy: 'axb' must NOT match the 'a_' literal prefix search.
 ('01960000-0000-7000-8000-000000000e01','AxB User','axb-605@example.com',1,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z','axb','member',0);

-- ----- root directories (depth 0) -----
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at)
VALUES
 ('01960000-0000-7000-8000-0000000000d1','01960000-0000-7000-8000-000000000a01',NULL,'root','',0,0,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
 ('01960000-0000-7000-8000-0000000000d2','01960000-0000-7000-8000-000000000a02',NULL,'root','',0,0,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z'),
 ('01960000-0000-7000-8000-0000000000d3','01960000-0000-7000-8000-000000000b01',NULL,'root','',0,0,'2025-01-01T00:00:00.000Z','2025-01-01T00:00:00.000Z');

-- ===========================================================================
-- ALICE notes. Tag "wikilinks" is shared by N1 and N3 for the tag-filter case.
--
-- Ordering design (published_at DESC vs updatedAt DESC are INVERTED):
--   note      published_at        updated_at
--   N1 (apple) 2026-06-08 (newest pub)  2025-02-01 (oldest upd)
--   N2 (banana)2026-05-01             2025-06-01
--   N3 (cherry)2026-01-15             2026-06-08 (newest upd)
--   N4 (date)  2025-04-01 (>1yr ago)    2026-06-07
-- So "公開日順" → apple, banana, cherry, date
--    "更新日順" → cherry, date, banana, apple   (clearly different)
--
-- Period-window design (date_for_calendar differs from published_at):
--   N1 apple: published today-ish (within 7d) but date_for_calendar 2 years ago.
--   N4 date:  published >1yr ago (outside 1y window).
-- ===========================================================================

INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, created_at, updated_at, version)
VALUES
 ('01960000-0000-7000-8000-0000000000a1','01960000-0000-7000-8000-000000000a01','01960000-0000-7000-8000-0000000000d1','apple-note','Apple Note','<p>wikilinks zorptest keyword</p>','{}','active','2025-01-10T00:00:00.000Z','2025-02-01T00:00:00.000Z',0),
 ('01960000-0000-7000-8000-0000000000a2','01960000-0000-7000-8000-000000000a01','01960000-0000-7000-8000-0000000000d1','banana-note','Banana Note','<p>banana zorptest keyword</p>','{}','active','2025-01-10T00:00:00.000Z','2025-06-01T00:00:00.000Z',0),
 ('01960000-0000-7000-8000-0000000000a3','01960000-0000-7000-8000-000000000a01','01960000-0000-7000-8000-0000000000d1','cherry-note','Cherry Note','<p>wikilinks cherry zorptest keyword</p>','{}','active','2025-01-10T00:00:00.000Z','2026-06-08T00:00:00.000Z',0),
 ('01960000-0000-7000-8000-0000000000a4','01960000-0000-7000-8000-000000000a01','01960000-0000-7000-8000-0000000000d1','date-note','Date Note','<p>date zorptest keyword</p>','{}','active','2025-01-10T00:00:00.000Z','2026-06-07T00:00:00.000Z',0),
 -- Trashed but publication row still public (relay lag): must be excluded from
 -- listing+total. A trashed note MUST carry a non-null trashed_at (domain
 -- invariant `Trashed note must have trashedAt`), else rehydration throws.
 -- Anomaly: visibility public but published_at IS NULL → must be excluded.
 ('01960000-0000-7000-8000-0000000000a6','01960000-0000-7000-8000-000000000a01','01960000-0000-7000-8000-0000000000d1','null-pub-note','Null Pub Note','<p>nullpub zorptest keyword</p>','{}','active','2025-01-10T00:00:00.000Z','2026-06-06T00:00:00.000Z',0);

-- alicia + bob notes (each one public note so they appear in suggest)
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, created_at, updated_at, version)
VALUES
 ('01960000-0000-7000-8000-0000000000b1','01960000-0000-7000-8000-000000000a02','01960000-0000-7000-8000-0000000000d2','alicia-note','Alicia Note','<p>alicia zorptest keyword</p>','{}','active','2025-01-10T00:00:00.000Z','2026-05-20T00:00:00.000Z',0),
 ('01960000-0000-7000-8000-0000000000b2','01960000-0000-7000-8000-000000000b01','01960000-0000-7000-8000-0000000000d3','bob-note','Bob Note','<p>bob zorptest keyword</p>','{}','active','2025-01-10T00:00:00.000Z','2026-05-20T00:00:00.000Z',0);

-- Trashed-but-public note (relay lag). Separate INSERT to set trashed_at
-- (domain invariant: a trashed note must carry a non-null trashed_at).
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version)
VALUES
 ('01960000-0000-7000-8000-0000000000a5','01960000-0000-7000-8000-000000000a01','01960000-0000-7000-8000-0000000000d1','trashed-note','Trashed Ghost Note','<p>trashedghost zorptest keyword</p>','{}','trashed','2026-06-09T00:00:00.000Z','2025-01-10T00:00:00.000Z','2026-06-09T00:00:00.000Z',0);

-- ----- tags + note_tags (shared tag "wikilinks" on apple & cherry) -----
INSERT INTO tags (id, owner_id, name, name_normalized, version, created_at, updated_at)
VALUES ('01960000-0000-7000-8000-0000000000f1','01960000-0000-7000-8000-000000000a01','wikilinks','wikilinks',0,'2025-01-10T00:00:00.000Z','2025-01-10T00:00:00.000Z');
INSERT INTO note_tags (note_id, tag_id) VALUES
 ('01960000-0000-7000-8000-0000000000a1','01960000-0000-7000-8000-0000000000f1'),
 ('01960000-0000-7000-8000-0000000000a3','01960000-0000-7000-8000-0000000000f1');

-- ----- publication_states (active JOIN gate; published_at is the #605 sort key) -----
INSERT INTO publication_states (note_id, owner_id, visibility, published_at, updated_at, version)
VALUES
 ('01960000-0000-7000-8000-0000000000a1','01960000-0000-7000-8000-000000000a01','public','2026-06-08T00:00:00.000Z','2026-06-08T00:00:00.000Z',0),
 ('01960000-0000-7000-8000-0000000000a2','01960000-0000-7000-8000-000000000a01','public','2026-05-01T00:00:00.000Z','2026-05-01T00:00:00.000Z',0),
 ('01960000-0000-7000-8000-0000000000a3','01960000-0000-7000-8000-000000000a01','public','2026-01-15T00:00:00.000Z','2026-01-15T00:00:00.000Z',0),
 ('01960000-0000-7000-8000-0000000000a4','01960000-0000-7000-8000-000000000a01','public','2025-04-01T00:00:00.000Z','2025-04-01T00:00:00.000Z',0),
 -- trashed-but-public (relay lag)
 ('01960000-0000-7000-8000-0000000000a5','01960000-0000-7000-8000-000000000a01','public','2026-06-05T00:00:00.000Z','2026-06-05T00:00:00.000Z',0),
 -- anomaly: public + published_at NULL
 ('01960000-0000-7000-8000-0000000000a6','01960000-0000-7000-8000-000000000a01','public',NULL,'2026-06-06T00:00:00.000Z',0),
 ('01960000-0000-7000-8000-0000000000b1','01960000-0000-7000-8000-000000000a02','public','2026-05-20T00:00:00.000Z','2026-05-20T00:00:00.000Z',0),
 ('01960000-0000-7000-8000-0000000000b2','01960000-0000-7000-8000-000000000b01','public','2026-05-20T00:00:00.000Z','2026-05-20T00:00:00.000Z',0);

-- ----- search_documents (FTS triggers auto-populate search_documents_fts) -----
-- date_for_calendar deliberately diverges from published_at for apple & date.
--   apple: published 2026-06-08 (within 7d) but date_for_calendar 2024-06-09 (2yr ago)
--   date:  published 2025-04-01 (>1yr) but date_for_calendar 2026-06-01 (recent)
-- The #605 facets must window on published_at, NOT date_for_calendar.
INSERT INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at)
VALUES
 ('01960000-0000-7000-8000-0000000000a1','01960000-0000-7000-8000-000000000a01','public','Apple Note','wikilinks zorptest keyword apple body','["wikilinks"]','','2024-06-09T00:00:00.000Z','2026-06-08T00:00:00.000Z','2026-06-08T00:00:00.000Z'),
 ('01960000-0000-7000-8000-0000000000a2','01960000-0000-7000-8000-000000000a01','public','Banana Note','banana zorptest keyword banana body','[]','','2026-05-01T00:00:00.000Z','2026-05-01T00:00:00.000Z','2026-05-01T00:00:00.000Z'),
 ('01960000-0000-7000-8000-0000000000a3','01960000-0000-7000-8000-000000000a01','public','Cherry Note','wikilinks cherry zorptest keyword cherry body','["wikilinks"]','','2026-01-15T00:00:00.000Z','2026-01-15T00:00:00.000Z','2026-01-15T00:00:00.000Z'),
 ('01960000-0000-7000-8000-0000000000a4','01960000-0000-7000-8000-000000000a01','public','Date Note','date zorptest keyword date body','[]','','2026-06-01T00:00:00.000Z','2025-04-01T00:00:00.000Z','2025-04-01T00:00:00.000Z'),
 ('01960000-0000-7000-8000-0000000000b1','01960000-0000-7000-8000-000000000a02','public','Alicia Note','alicia zorptest keyword body','[]','','2026-05-20T00:00:00.000Z','2026-05-20T00:00:00.000Z','2026-05-20T00:00:00.000Z'),
 ('01960000-0000-7000-8000-0000000000b2','01960000-0000-7000-8000-000000000b01','public','Bob Note','bob zorptest keyword body','[]','','2026-05-20T00:00:00.000Z','2026-05-20T00:00:00.000Z','2026-05-20T00:00:00.000Z');
