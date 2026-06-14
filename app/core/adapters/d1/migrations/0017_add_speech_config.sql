-- Issue #701: extend instance_settings with the speech-recognition
-- (transcription) provider configuration, separate from the LLM config.
-- The provider / api-key-source columns are NOT NULL with defaults so the
-- existing singleton row materializes valid values without a backfill;
-- model / ciphertext are nullable and `InstanceSettings.reconstruct`
-- (`coerceSpeech`) substitutes the default model when NULL. See ADR-004.

ALTER TABLE instance_settings ADD COLUMN speech_provider TEXT NOT NULL DEFAULT 'openai';
ALTER TABLE instance_settings ADD COLUMN speech_model TEXT;
ALTER TABLE instance_settings ADD COLUMN speech_api_key_source TEXT NOT NULL DEFAULT 'env' CHECK (speech_api_key_source IN ('env', 'db'));
ALTER TABLE instance_settings ADD COLUMN speech_api_key_ciphertext TEXT;
