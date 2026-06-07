-- Issue #549 manual-test seed
-- owner: dev-admin (01950000-0000-7000-8000-000000000001)
-- root dir: 019e9845-7d00-76d2-9276-b1771d744df1

-- Clean prior #549 seed (idempotent)
DELETE FROM note_internal_links WHERE from_note_id IN (
  '019e9900-0000-7000-8000-000000000001',
  '019e9900-0000-7000-8000-000000000003',
  '019e9900-0000-7000-8000-000000000004');
DELETE FROM notes WHERE id IN (
  '019e9900-0000-7000-8000-000000000001',
  '019e9900-0000-7000-8000-000000000002',
  '019e9900-0000-7000-8000-000000000003',
  '019e9900-0000-7000-8000-000000000004');
DELETE FROM directories WHERE id IN (
  '019e9900-0000-7000-8000-0000000000a1',
  '019e9900-0000-7000-8000-0000000000a2');

-- Nested directories: Research / 書籍要約 (depth 1 / 2)
INSERT INTO directories (id, owner_id, parent_id, name, slug, depth, version, created_at, updated_at) VALUES
('019e9900-0000-7000-8000-0000000000a1','01950000-0000-7000-8000-000000000001','019e9845-7d00-76d2-9276-b1771d744df1','Research','research',1,0,'2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z'),
('019e9900-0000-7000-8000-0000000000a2','01950000-0000-7000-8000-000000000001','019e9900-0000-7000-8000-0000000000a1','書籍要約','shoseki',2,0,'2026-06-01T00:00:00.000Z','2026-06-01T00:00:00.000Z');

-- Target note (the one we view). Body holds literal [[..]] / #.. (verbatim) + a code block.
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, created_at, updated_at, version) VALUES
('019e9900-0000-7000-8000-000000000001','01950000-0000-7000-8000-000000000001','019e9845-7d00-76d2-9276-b1771d744df1','quiet-interface','静かなインターフェース',
'<p>解決済みの内部リンク: [[019e9900-0000-7000-8000-000000000002|A Pattern Language を読みながら]] を参照した。</p><p>未解決の内部リンク: [[未解決ノート]] はまだ存在しない。</p><p>タグで辿る: #design #essay</p><pre><code>#include &lt;stdio.h&gt;
const x = [[notlink]];</code></pre>',
'{}','active','2026-06-02T00:00:00.000Z','2026-06-02T00:00:00.000Z',0);

-- Link target for the resolved wikilink
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, created_at, updated_at, version) VALUES
('019e9900-0000-7000-8000-000000000002','01950000-0000-7000-8000-000000000001','019e9845-7d00-76d2-9276-b1771d744df1','a-pattern-language','A Pattern Language を読みながら',
'<p>パタン・ランゲージの考え方。</p>','{}','active','2026-06-02T00:00:00.000Z','2026-06-02T00:00:00.000Z',0);

-- Referrer in ROOT dir (backlink-meta should be empty / hidden)
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, created_at, updated_at, version) VALUES
('019e9900-0000-7000-8000-000000000003','01950000-0000-7000-8000-000000000001','019e9845-7d00-76d2-9276-b1771d744df1','morning-walk','朝の散歩で考えたこと',
'<p>前に書いた 静かなインターフェースについての覚書 を散歩中に思い出していた。</p>','{}','active','2026-06-03T00:00:00.000Z','2026-06-03T00:00:00.000Z',0);

-- Referrer in NESTED dir Research/書籍要約 (backlink-meta = RESEARCH / 書籍要約)
INSERT INTO notes (id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, created_at, updated_at, version) VALUES
('019e9900-0000-7000-8000-000000000004','01950000-0000-7000-8000-000000000001','019e9900-0000-7000-8000-0000000000a2','tanstack-start','TanStack Start に乗り換えた理由',
'<p>UI の余白の取り方は 静かなインターフェース で書いた方針に従った。</p>','{}','active','2026-06-03T00:00:00.000Z','2026-06-03T00:00:00.000Z',0);

-- note-main's own internal links (drive wikilink rendering)
INSERT INTO note_internal_links (id, from_note_id, ref_kind, ref_target, display_text, resolved_note_id) VALUES
('019e9900-0000-7000-8000-0000000000b1','019e9900-0000-7000-8000-000000000001','id','019e9900-0000-7000-8000-000000000002','A Pattern Language を読みながら','019e9900-0000-7000-8000-000000000002'),
('019e9900-0000-7000-8000-0000000000b2','019e9900-0000-7000-8000-000000000001','title','未解決ノート',NULL,NULL);

-- Backlinks: referrers resolve to note-main
INSERT INTO note_internal_links (id, from_note_id, ref_kind, ref_target, display_text, resolved_note_id) VALUES
('019e9900-0000-7000-8000-0000000000b3','019e9900-0000-7000-8000-000000000003','id','019e9900-0000-7000-8000-000000000001','静かなインターフェース','019e9900-0000-7000-8000-000000000001'),
('019e9900-0000-7000-8000-0000000000b4','019e9900-0000-7000-8000-000000000004','id','019e9900-0000-7000-8000-000000000001','静かなインターフェース','019e9900-0000-7000-8000-000000000001');
