-- Issue #92 browser-verify seed: public notes with short-keyword bodies.
-- Owner: test-user-001, directory: ...d0. search_documents triggers sync FTS.
PRAGMA foreign_keys = ON;

-- TC1: ASCII short "AI"
INSERT OR REPLACE INTO notes (id, owner_id, directory_id, slug, title, content_html, created_at, updated_at)
VALUES ('01938f00-0000-7000-8000-0000009200e1','01938f00-0000-7000-8000-000000000001','01938f00-0000-7000-8000-0000000000d0','i92-ai','AI tools','<p>x</p>','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z');
INSERT OR REPLACE INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at)
VALUES ('01938f00-0000-7000-8000-0000009200e1','01938f00-0000-7000-8000-000000000001','public','AI tools','Notes about AI and machine learning for productivity','["tech"]','','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z');

-- TC2: CJK 1-char "本"
INSERT OR REPLACE INTO notes (id, owner_id, directory_id, slug, title, content_html, created_at, updated_at)
VALUES ('01938f00-0000-7000-8000-0000009200e2','01938f00-0000-7000-8000-000000000001','01938f00-0000-7000-8000-0000000000d0','i92-hon','読書記録','<p>x</p>','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z');
INSERT OR REPLACE INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at)
VALUES ('01938f00-0000-7000-8000-0000009200e2','01938f00-0000-7000-8000-000000000001','public','読書記録','本を読んだ感想をまとめる。今月の本は面白かった','["reading"]','','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z');

-- Pagination: two public "Go" hits
INSERT OR REPLACE INTO notes (id, owner_id, directory_id, slug, title, content_html, created_at, updated_at)
VALUES ('01938f00-0000-7000-8000-0000009200e3','01938f00-0000-7000-8000-000000000001','01938f00-0000-7000-8000-0000000000d0','i92-go1','Go言語入門','<p>x</p>','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z');
INSERT OR REPLACE INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at)
VALUES ('01938f00-0000-7000-8000-0000009200e3','01938f00-0000-7000-8000-000000000001','public','Go言語入門','Go is a programming language. Learning Go basics','["go"]','','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z');
INSERT OR REPLACE INTO notes (id, owner_id, directory_id, slug, title, content_html, created_at, updated_at)
VALUES ('01938f00-0000-7000-8000-0000009200e4','01938f00-0000-7000-8000-000000000001','01938f00-0000-7000-8000-0000000000d0','i92-go2','Golang tips','<p>x</p>','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z');
INSERT OR REPLACE INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at)
VALUES ('01938f00-0000-7000-8000-0000009200e4','01938f00-0000-7000-8000-000000000001','public','Golang tips','More Go snippets and Go idioms','["go"]','','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z');

-- Escape test: literal "50%"
INSERT OR REPLACE INTO notes (id, owner_id, directory_id, slug, title, content_html, created_at, updated_at)
VALUES ('01938f00-0000-7000-8000-0000009200e5','01938f00-0000-7000-8000-000000000001','01938f00-0000-7000-8000-0000000000d0','i92-sale','セール情報','<p>x</p>','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z');
INSERT OR REPLACE INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at)
VALUES ('01938f00-0000-7000-8000-0000009200e5','01938f00-0000-7000-8000-000000000001','public','セール情報','本日のセールは50%オフ。お得です','["sale"]','','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z');

-- Mixed "AI デザイン" → only デザイン matches (body has デザイン, no AI)
INSERT OR REPLACE INTO notes (id, owner_id, directory_id, slug, title, content_html, created_at, updated_at)
VALUES ('01938f00-0000-7000-8000-0000009200e6','01938f00-0000-7000-8000-000000000001','01938f00-0000-7000-8000-0000000000d0','i92-mixed','レイアウトのコツ','<p>x</p>','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z');
INSERT OR REPLACE INTO search_documents (note_id, owner_id, visibility, title, body_plain, tag_names_json, directory_path, date_for_calendar, updated_at, indexed_at)
VALUES ('01938f00-0000-7000-8000-0000009200e6','01938f00-0000-7000-8000-000000000001','public','レイアウトのコツ','デザインの基本原則について。余白とコントラスト','["layout"]','','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z');
