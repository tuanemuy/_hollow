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
  InvalidSuggestedDirectoryName: "ingestion_invalid_suggested_directory_name",

  // State-transition guards
  InvalidStateForStart: "ingestion_invalid_state_for_start",
  InvalidStateForAttachPreview: "ingestion_invalid_state_for_attach_preview",
  InvalidStateForRegenerate: "invalid_status_for_regeneration",
  InvalidStateForCommit: "invalid_status_for_commit",
  InvalidStateForDiscard: "invalid_status_for_discard",
  InvalidStateForRetry: "ingestion_invalid_state_for_retry",
  NoTempStorageForRetry: "ingestion_no_temp_storage_for_retry",

  RegenerationLimitExceeded: "regeneration_limit_exceeded",
  ByteSizeExceedsLimit: "ingestion_byte_size_exceeds_limit",
  UnsupportedFormat: "unsupported_format",
  DailyUploadQuotaExceeded: "daily_upload_quota_exceeded",

  MissingSavedNoteId: "ingestion_missing_saved_note_id",
} as const;

export type IngestionErrorCode =
  (typeof IngestionErrorCode)[keyof typeof IngestionErrorCode];
