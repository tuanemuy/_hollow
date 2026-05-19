-- ---------------------------------------------------------------------------
-- Issue #32 — manual-test seed
--
-- Adds 4 notes on top of the 2026-05-17 baseline seed:
--
--   * Note A (existing-user)   : title "ターゲット" — target of internal links
--   * Note B (existing-user)   : body contains [[ターゲット]] → links to A
--   * Note C (existing-user)   : body contains [[ターゲット]] → links to A
--   * Note X (mailowner)       : owner-mismatch sanity check note
--
-- The `note_internal_links` table is populated with two rows so the loader's
-- `findByOwner({ referencingNoteId: A.id })` returns [B, C].
--
-- All INSERTs are `INSERT OR IGNORE` so reruns are no-ops.
--
-- IDs follow the issue-32 namespace: `01938f32-0000-7000-8000-0000000000{XX}`
-- which is disjoint from the baseline `01938f00` / `01938f01` namespaces.
-- ---------------------------------------------------------------------------

-- Note A — owner=existing-user, title "ターゲット"
INSERT OR IGNORE INTO notes (
  id, owner_id, directory_id,
  slug, title, content_html, front_matter_json,
  status, trashed_at,
  created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  version
) VALUES (
  '01938f32-0000-7000-8000-00000000000a',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f00-0000-7000-8000-0000000000a3',
  'issue-32-target',
  'ターゲット',
  '<p>This is the link target note for Issue #32 manual tests.</p>',
  '{}',
  'active',
  NULL,
  '2026-05-19T00:00:00.000Z',
  '2026-05-19T00:00:00.000Z',
  NULL, NULL, NULL,
  0
);

-- Note B — owner=existing-user, links to Note A via wikilink
INSERT OR IGNORE INTO notes (
  id, owner_id, directory_id,
  slug, title, content_html, front_matter_json,
  status, trashed_at,
  created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  version
) VALUES (
  '01938f32-0000-7000-8000-00000000000b',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f00-0000-7000-8000-0000000000a3',
  'issue-32-referrer-b',
  'リファラ B',
  '<p>This note references [[ターゲット]] for Issue #32 backlink tests.</p>',
  '{}',
  'active',
  NULL,
  '2026-05-19T00:00:01.000Z',
  '2026-05-19T00:00:01.000Z',
  NULL, NULL, NULL,
  0
);

-- Note C — owner=existing-user, links to Note A via wikilink
INSERT OR IGNORE INTO notes (
  id, owner_id, directory_id,
  slug, title, content_html, front_matter_json,
  status, trashed_at,
  created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  version
) VALUES (
  '01938f32-0000-7000-8000-00000000000c',
  '01938f00-0000-7000-8000-0000000000a1',
  '01938f00-0000-7000-8000-0000000000a3',
  'issue-32-referrer-c',
  'リファラ C',
  '<p>This note also references [[ターゲット]] for Issue #32 backlink tests.</p>',
  '{}',
  'active',
  NULL,
  '2026-05-19T00:00:02.000Z',
  '2026-05-19T00:00:02.000Z',
  NULL, NULL, NULL,
  0
);

-- Note X — owner=mailowner, not linked. Used to exercise owner-mismatch path.
INSERT OR IGNORE INTO notes (
  id, owner_id, directory_id,
  slug, title, content_html, front_matter_json,
  status, trashed_at,
  created_at, updated_at,
  edit_lock_user_id, edit_lock_acquired_at, edit_lock_expires_at,
  version
) VALUES (
  '01938f32-0000-7000-8000-0000000000ff',
  '01938f00-0000-7000-8000-0000000000b1',
  '01938f00-0000-7000-8000-0000000000b3',
  'issue-32-other-owner',
  '他人のノート X',
  '<p>This note belongs to a different owner (mailowner).</p>',
  '{}',
  'active',
  NULL,
  '2026-05-19T00:00:03.000Z',
  '2026-05-19T00:00:03.000Z',
  NULL, NULL, NULL,
  0
);

-- ---------------------------------------------------------------------------
-- note_internal_links — resolved links B→A and C→A
--
-- Mirrors the shape `D1NoteRepository.save` would insert:
--   refKind='id', refTarget=<A.id>, displayText=NULL, resolvedNoteId=<A.id>
-- ---------------------------------------------------------------------------

INSERT OR IGNORE INTO note_internal_links (
  id, from_note_id, ref_kind, ref_target, display_text, resolved_note_id
) VALUES (
  '01938f32-0000-7000-8000-000000000b01',
  '01938f32-0000-7000-8000-00000000000b',
  'id',
  '01938f32-0000-7000-8000-00000000000a',
  NULL,
  '01938f32-0000-7000-8000-00000000000a'
);

INSERT OR IGNORE INTO note_internal_links (
  id, from_note_id, ref_kind, ref_target, display_text, resolved_note_id
) VALUES (
  '01938f32-0000-7000-8000-000000000c01',
  '01938f32-0000-7000-8000-00000000000c',
  'id',
  '01938f32-0000-7000-8000-00000000000a',
  NULL,
  '01938f32-0000-7000-8000-00000000000a'
);
