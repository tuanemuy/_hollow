-- Issue #101: extend instance_settings with the LLM endpoint base URL
-- column required by the OpenAI-compatible provider. Anthropic and
-- Gemini ignore this column (enforced by the LLMConfig VO invariant);
-- it is only populated when llm_provider = 'openai'. The column is
-- nullable so existing rows continue to satisfy the schema without a
-- backfill.

ALTER TABLE instance_settings ADD COLUMN llm_base_url TEXT;
