export const IngestionErrorCode = {
  InvalidId: "INGESTION_INVALID_ID",
  InvalidStatus: "INGESTION_INVALID_STATUS",
  InvalidSourceFileKind: "INGESTION_INVALID_SOURCE_FILE_KIND",
  InvalidMimeType: "INGESTION_INVALID_MIME_TYPE",
  InvalidByteSize: "INGESTION_INVALID_BYTE_SIZE",
  InvalidRegenerationCount: "INGESTION_INVALID_REGENERATION_COUNT",
  InvalidFileName: "INGESTION_INVALID_FILE_NAME",
  InvalidTempStorageKey: "INGESTION_INVALID_TEMP_STORAGE_KEY",
  InvalidErrorCode: "INGESTION_INVALID_ERROR_CODE",
  InvalidErrorReason: "INGESTION_INVALID_ERROR_REASON",
  InvalidIngestionLimits: "INGESTION_INVALID_LIMITS",
  InvalidSuggestedDirectoryName: "INGESTION_INVALID_SUGGESTED_DIRECTORY_NAME",

  // State-transition guards
  InvalidStateForStart: "INGESTION_INVALID_STATE_FOR_START",
  InvalidStateForAttachPreview: "INGESTION_INVALID_STATE_FOR_ATTACH_PREVIEW",
  InvalidStateForRegenerate: "INGESTION_INVALID_STATE_FOR_REGENERATE",
  InvalidStateForCommit: "INGESTION_INVALID_STATE_FOR_COMMIT",
  InvalidStateForDiscard: "INGESTION_INVALID_STATE_FOR_DISCARD",
  InvalidStateForRetry: "INGESTION_INVALID_STATE_FOR_RETRY",
  NoTempStorageForRetry: "INGESTION_NO_TEMP_STORAGE_FOR_RETRY",

  RegenerationLimitExceeded: "INGESTION_REGENERATION_LIMIT_EXCEEDED",
  ByteSizeExceedsLimit: "INGESTION_BYTE_SIZE_EXCEEDS_LIMIT",
  UnsupportedFormat: "INGESTION_UNSUPPORTED_FORMAT",

  MissingSavedNoteId: "INGESTION_MISSING_SAVED_NOTE_ID",
} as const;

export type IngestionErrorCode =
  (typeof IngestionErrorCode)[keyof typeof IngestionErrorCode];
