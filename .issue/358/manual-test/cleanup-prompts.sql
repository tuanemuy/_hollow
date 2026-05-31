-- Issue #358 — manual-test prompt cleanup (revert seed-prompts.sql)
--
-- Returns the DB to the Phase 1 "empty fallback" state:
--   - instance_settings.prompts_json back to '{}' (the column default / empty
--     overrides map). The singleton row itself is left in place because a
--     deployed instance may legitimately own one; only prompts_json is reset.
--   - existing-user's override row is removed entirely.
--
-- NOTE: this does NOT DELETE the instance_settings row. On a fresh DB where
-- seed-prompts.sql created the singleton row, resetting prompts_json to '{}'
-- is sufficient — the resolver returns "" for every purpose, so the upload
-- dialog shows "プロバイダ組み込み" / "LLM プロバイダの既定指示を使用" exactly as
-- it would with no row at all. If you want a literally row-less state, run:
--   DELETE FROM instance_settings WHERE id = 'singleton';

UPDATE instance_settings
SET prompts_json = '{}',
    updated_at = '2026-05-31T00:00:00.000Z'
WHERE id = 'singleton';

DELETE FROM user_prompt_overrides
WHERE owner_id = '01938f00-0000-7000-8000-0000000000a1';
