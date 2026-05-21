export const MediaErrorCode = {
  InvalidId: "media_invalid_id",
  InvalidKind: "media_invalid_kind",
  InvalidBackend: "media_invalid_backend",
  InvalidStatus: "media_invalid_status",
  InvalidVisibility: "media_invalid_visibility",
  InvalidMimeType: "media_invalid_mime_type",
  InvalidByteSize: "media_invalid_byte_size",
  InvalidDimension: "media_invalid_dimension",
  InvalidDuration: "media_invalid_duration",
  InvalidStorageKey: "media_invalid_storage_key",
  InvalidOriginalFileName: "media_invalid_original_file_name",
  InvalidRefCount: "media_invalid_ref_count",
  InvariantRefCountNegative: "media_ref_count_negative",
  InvariantStatusRefCountMismatch: "media_status_ref_count_mismatch",
  IllegalTransition: "media_illegal_transition",
  NotOwned: "media_not_owned",
  NotViewable: "media_not_viewable",
  ByteSizeExceeded: "media_byte_size_exceeded",
  ByteSizeMismatch: "media_byte_size_mismatch",
} as const;

export type MediaErrorCode =
  (typeof MediaErrorCode)[keyof typeof MediaErrorCode];
