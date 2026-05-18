export const ExportErrorCode = {
  InvalidId: "EXPORT_INVALID_ID",
  InvalidFormat: "EXPORT_INVALID_FORMAT",
  InvalidScope: "EXPORT_INVALID_SCOPE",
  InvalidStatus: "EXPORT_INVALID_STATUS",
  InvalidPaperSize: "EXPORT_INVALID_PAPER_SIZE",
  InvalidProgress: "EXPORT_INVALID_PROGRESS",
  InvalidArtifactSize: "EXPORT_INVALID_ARTIFACT_SIZE",
  InvalidTtl: "EXPORT_INVALID_TTL",
  InvalidErrorCode: "EXPORT_INVALID_ERROR_CODE",
  InvalidErrorReason: "EXPORT_INVALID_ERROR_REASON",
  InvalidArtifactKey: "EXPORT_INVALID_ARTIFACT_KEY",
  InvalidKeyword: "EXPORT_INVALID_KEYWORD",
  InvalidDateRange: "EXPORT_INVALID_DATE_RANGE",
  ScopeTargetMismatch: "EXPORT_SCOPE_TARGET_MISMATCH",
  IllegalTransition: "EXPORT_ILLEGAL_TRANSITION",
  InvalidStateForRetry: "EXPORT_INVALID_STATE_FOR_RETRY",
  CompletedMissingArtifact: "EXPORT_COMPLETED_MISSING_ARTIFACT",
  QuotaExceeded: "export_quota_exceeded",
  Unauthorized: "export_unauthorized",
  PdfNotImplemented: "pdf_export_not_implemented_in_mvp",
} as const;

export type ExportErrorCode =
  (typeof ExportErrorCode)[keyof typeof ExportErrorCode];
