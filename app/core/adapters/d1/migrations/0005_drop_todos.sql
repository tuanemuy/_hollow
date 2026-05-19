-- 0005_drop_todos.sql
-- Remove the template-derived todos table (spec-sync Issue #6).
DROP TABLE IF EXISTS `todos`;
DROP INDEX IF EXISTS `idx_todos_created_id`;
