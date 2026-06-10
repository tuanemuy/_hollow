export const IngestionErrorCode = {
  InvalidId: "ingestion_invalid_id",
  InvalidStatus: "ingestion_invalid_status",
  InvalidSourceFileKind: "ingestion_invalid_source_file_kind",
  InvalidMimeType: "ingestion_invalid_mime_type",
  InvalidByteSize: "ingestion_invalid_byte_size",
  InvalidRegenerationCount: "ingestion_invalid_regeneration_count",
  InvalidFileName: "ingestion_invalid_file_name",
  InvalidTempStorageKey: "ingestion_invalid_temp_storage_key",
  InvalidErrorCode: "ingestion_invalid_error_code",
  InvalidErrorReason: "ingestion_invalid_error_reason",
  InvalidIngestionLimits: "ingestion_invalid_limits",
  InvalidPromptOverride: "ingestion_invalid_prompt_override",

  // State-transition guards
  InvalidStateForStart: "ingestion_invalid_state_for_start",
  InvalidStateForAttachPreview: "ingestion_invalid_state_for_attach_preview",
  InvalidStateForRegenerate: "invalid_status_for_regeneration",
  InvalidStateForCommit: "invalid_status_for_commit",
  InvalidStateForDiscard: "invalid_status_for_discard",
  InvalidStateForRetry: "ingestion_invalid_state_for_retry",
  InvalidStateForRollback: "ingestion_invalid_state_for_rollback",
  NoTempStorageForRetry: "ingestion_no_temp_storage_for_retry",

  RegenerationLimitExceeded: "regeneration_limit_exceeded",
  ByteSizeExceedsLimit: "ingestion_byte_size_exceeds_limit",
  UnsupportedFormat: "unsupported_format",
  DailyUploadQuotaExceeded: "daily_upload_quota_exceeded",

  MissingSavedNoteId: "ingestion_missing_saved_note_id",

  // Prompt preview. The previewPrompt usecase translates raw LLM transport
  // errors into these so the UI can show an honest reason instead of the
  // generic business fallback. `llm_failure` (unavailable / timeout) reuses
  // the existing pipeline identifier.
  LLMRateLimited: "llm_rate_limited",
  LLMQuotaExceeded: "llm_quota_exceeded",
  LLMPreviewUnavailable: "llm_preview_unavailable",
  PromptPreviewRateLimited: "prompt_preview_rate_limited",
} as const;

export type IngestionErrorCode =
  (typeof IngestionErrorCode)[keyof typeof IngestionErrorCode];
