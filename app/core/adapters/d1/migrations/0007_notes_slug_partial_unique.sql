-- Manual migration (not drizzle-kit generated). Uses `IF NOT EXISTS` /
-- `IF EXISTS` to be idempotent for repeated `db:apply:local` runs.
--
-- Issue #42: convert `uniq_notes_owner_slug` to a partial unique index
-- limited to active rows. This lets an active note and a trashed note
-- coexist with the same `(owner_id, slug)`, which `RestoreNote`'s
-- `slug_conflict` test fixture depends on. Active-vs-active collisions
-- remain blocked.

DROP INDEX IF EXISTS `uniq_notes_owner_slug`;

CREATE UNIQUE INDEX IF NOT EXISTS `uniq_notes_owner_slug`
  ON `notes` (`owner_id`, `slug`)
  WHERE status = 'active';
