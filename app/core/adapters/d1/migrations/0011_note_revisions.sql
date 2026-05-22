-- Issue #158: P11 NoteRevision aggregate.
-- Append-only history table holding immutable snapshots of `notes`
-- written each time `SaveNote` or `RestoreNoteRevision` succeeds. Rows
-- carry the full body so any single revision can be restored without
-- chaining (ADR-003). The per-note retention ceiling is enforced
-- application-side from `AdminSettings.limits.maxNoteRevisionsPerNote`
-- (ADR-004); when a fresh insert would exceed the ceiling, the same
-- UoW deletes the oldest row(s).
--
-- `owner_id` is denormalised from `notes.owner_id` so the table can be
-- pruned and indexed without joining `notes` (S-003 in plan.md). The
-- authoritative ownership check still goes through `notes.owner_id`.
--
-- `ON DELETE CASCADE` on `note_id` ensures `PurgeNote` (physical delete
-- of a trashed note after retention) wipes the history with no extra
-- application bookkeeping.
--
-- `created_by_user_id` is denormalised here for future collaborator
-- support (plan E-2 reserves the column even though MVP UI hides it).
-- Under MVP the value always equals `owner_id`, so the CASCADE on
-- `users` is redundant with the `owner_id` CASCADE. When collaborator
-- editing lands, this FK should switch to `ON DELETE SET NULL` so a
-- coauthor's account removal does not wipe the owner's history (see
-- W-D-001 in `.issue/158/review/review-001.md`). Tracked for follow-up.

CREATE TABLE note_revisions (
  id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_html TEXT NOT NULL,
  front_matter_json TEXT NOT NULL DEFAULT '{}',
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);

-- Primary listing path: newest-first within a single note. Secondary
-- `id DESC` keeps the order deterministic when two revisions share a
-- `created_at` (UUIDv7 ids are monotonic per ms, so this tracks
-- insertion order — see S-004 in plan.md).
CREATE INDEX idx_note_revisions_note_created
  ON note_revisions(note_id, created_at DESC, id DESC);

-- Owner-scoped maintenance / future analytics. The request path always
-- joins through `notes.owner_id`, but admin operations (e.g. user
-- deletion bookkeeping, owner-wide pruning) may scan by owner directly.
CREATE INDEX idx_note_revisions_owner
  ON note_revisions(owner_id);
