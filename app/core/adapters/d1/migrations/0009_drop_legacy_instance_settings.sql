-- Issue #60: drop the singleton instance_settings row when its
-- limits_json predates the current InstanceLimits shape (or
-- design_tokens_json is missing the `tokens` key). Past
-- manual-test seeds (.issue/{1,8,29,30}/...) inserted a legacy
-- shape ({perUserMaxNotes, perUserMaxMediaBytes, ...}) that no
-- longer satisfies InstanceLimits invariants, causing
-- D1InstanceSettingsRepository.toEntity to translate the
-- RehydrationError into SystemError(DataIntegrityError) on
-- /admin/llm, /admin/metrics, /admin/prompts, /admin/design,
-- /admin/registration, and /signup.
--
-- Once the row is gone, D1InstanceSettingsRepository.get()
-- materialises InstanceSettings.default(now) on read, restoring
-- the affected pages. Rows whose limits_json already matches the
-- current shape and whose design_tokens_json has the `tokens`
-- key are preserved.

DELETE FROM instance_settings
WHERE id = 'singleton'
  AND (
    json_type(limits_json, '$.maxUploadBytesPerDay') IS NULL
    OR json_type(design_tokens_json, '$.tokens') IS NULL
  );
