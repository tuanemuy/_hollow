-- 0015_pubs_owner_published_at.sql
-- Issue #605: owner-scoped published_at sort for P30「公開日順」.
--
-- The existing `idx_pubs_public_published_at` indexes `(published_at)`
-- alone, so an owner-scoped listing
-- (`owner_id = ? AND visibility = 'public' ORDER BY published_at`) cannot
-- use it for both the equality filter and the ordered read-out and falls
-- back to a full table scan. The composite
-- `(owner_id, visibility, published_at)` puts the equality columns first
-- and `published_at` last, so the new
-- `listPublicNoteIdsByOwnerSorted` read path stays index-bounded.
--
-- Manual migration (not drizzle-kit generated). `IF NOT EXISTS` keeps it
-- idempotent for repeated local `db:migrate` runs.

CREATE INDEX IF NOT EXISTS `idx_pubs_owner_visibility_published_at`
  ON `publication_states` (`owner_id`, `visibility`, `published_at`);
