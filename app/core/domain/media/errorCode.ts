export const MediaErrorCode = {
  InvalidId: "MEDIA_INVALID_ID",
  InvalidKind: "MEDIA_INVALID_KIND",
  InvalidBackend: "MEDIA_INVALID_BACKEND",
  InvalidStatus: "MEDIA_INVALID_STATUS",
  InvalidVisibility: "MEDIA_INVALID_VISIBILITY",
  InvalidMimeType: "MEDIA_INVALID_MIME_TYPE",
  InvalidByteSize: "MEDIA_INVALID_BYTE_SIZE",
  InvalidDimension: "MEDIA_INVALID_DIMENSION",
  InvalidDuration: "MEDIA_INVALID_DURATION",
  InvalidStorageKey: "MEDIA_INVALID_STORAGE_KEY",
  InvalidOriginalFileName: "MEDIA_INVALID_ORIGINAL_FILE_NAME",
  InvalidRefCount: "MEDIA_INVALID_REF_COUNT",
  InvariantRefCountNegative: "MEDIA_REF_COUNT_NEGATIVE",
  InvariantStatusRefCountMismatch: "MEDIA_STATUS_REF_COUNT_MISMATCH",
  IllegalTransition: "MEDIA_ILLEGAL_TRANSITION",
  NotOwned: "media_not_owned",
  NotViewable: "media_not_viewable",
} as const;

export type MediaErrorCode =
  (typeof MediaErrorCode)[keyof typeof MediaErrorCode];
