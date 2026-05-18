-- Add admin-wide listing indexes for `/admin/jobs` (P46).
--
-- The existing composite indexes lead with `owner_id` / `status`, so
-- the all-owners admin listing (`ORDER BY updated_at DESC, id DESC`)
-- falls back to a full table scan. Adding dedicated indexes on
-- `(updated_at DESC, id DESC)` keeps the admin sort bounded regardless
-- of total job volume.

CREATE INDEX IF NOT EXISTS `idx_ij_updated_at`
  ON `ingestion_jobs` (`updated_at` DESC, `id` DESC);

CREATE INDEX IF NOT EXISTS `idx_export_jobs_updated_at`
  ON `export_jobs` (`updated_at` DESC, `id` DESC);
