-- Issue #358 — manual-test prompt seed (Phase 2: instance default + user override)
--
-- Sets up the two non-empty prompt states for the upload-dialog "解決済み
-- 既定プロンプト" feature. Run AFTER the baseline user seed
-- (.manual-test/2026-05-17/seed.sql) so the override row's FK target exists.
--
-- After this runs:
--   - structure / metadata both have an INSTANCE default  → badge "インスタンス既定"
--   - existing-user (member) additionally overrides structure → that user sees
--     structure "ユーザー設定で上書き中", metadata still "インスタンス既定".
--   - any other user (e.g. admin-user) sees both as "インスタンス既定".
--
-- JSON shape (verified against app/core/adapters/d1/promptResolver.ts and the
-- domain rehydrate path app/core/domain/adminSettings/entity.ts):
--   prompts_json = { [purpose]: { text: string, expectedVariables: string[] } }
-- The override table is rehydrated through UserPromptOverride.reconstruct →
-- rehydratePartialPrompts → PromptTemplate.create, so:
--   * expectedVariables is REQUIRED (use [] when there are no placeholders),
--   * text must NOT contain any {{var}} placeholder that is absent from
--     expectedVariables, or PromptTemplate.create throws PromptTemplateVariableMismatch.
-- The texts below contain no placeholders, so expectedVariables = [] is correct.
--
-- The singleton instance_settings row does not exist on a fresh DB, so we
-- INSERT a full row honoring every NOT NULL column (llm_model,
-- llm_api_key_source, limits_json, updated_at) and the id='singleton' CHECK.
-- If a row already exists we instead want to UPDATE only prompts_json — the
-- INSERT below uses ON CONFLICT(id) to do exactly that, leaving the other
-- columns untouched for an existing (possibly production) row.

INSERT INTO instance_settings (
  id,
  llm_provider,
  llm_model,
  llm_api_key_source,
  llm_api_key_ciphertext,
  prompts_json,
  design_tokens_json,
  registration_open,
  registration_closed_reason,
  limits_json,
  version,
  updated_at
) VALUES (
  'singleton',
  'anthropic',
  'claude-3-5-sonnet-latest',
  'env',
  NULL,
  '{"structure":{"text":"これはテスト用のインスタンス既定 構造化プロンプトです","expectedVariables":[]},"metadata":{"text":"これはテスト用のインスタンス既定 メタデータプロンプトです","expectedVariables":[]}}',
  '{}',
  1,
  NULL,
  '{"maxUploadBytesPerDay":1073741824,"maxIngestionBytes":33554432,"maxNoteBytes":1048576,"maxExportArtifactBytes":268435456,"maxShareLinksPerNote":16,"editLockTtlSec":300,"trashRetentionDays":30,"maxNoteRevisionsPerNote":50}',
  0,
  '2026-05-31T00:00:00.000Z'
)
ON CONFLICT(id) DO UPDATE SET
  prompts_json = excluded.prompts_json,
  updated_at = excluded.updated_at;

-- User override: existing-user (member, id ...a1) overrides ONLY structure.
-- metadata is intentionally absent so it falls through to the instance default.
INSERT INTO user_prompt_overrides (
  owner_id,
  prompts_json,
  version,
  updated_at
) VALUES (
  '01938f00-0000-7000-8000-0000000000a1',
  '{"structure":{"text":"これはテスト用の existing-user ユーザー上書き 構造化プロンプトです","expectedVariables":[]}}',
  0,
  '2026-05-31T00:00:00.000Z'
)
ON CONFLICT(owner_id) DO UPDATE SET
  prompts_json = excluded.prompts_json,
  updated_at = excluded.updated_at;
