export const ExportErrorCode = {
  InvalidId: "export_invalid_id",
  InvalidFormat: "export_invalid_format",
  InvalidScope: "export_invalid_scope",
  InvalidStatus: "export_invalid_status",
  InvalidPaperSize: "export_invalid_paper_size",
  InvalidProgress: "export_invalid_progress",
  InvalidArtifactSize: "export_invalid_artifact_size",
  InvalidTtl: "export_invalid_ttl",
  InvalidErrorCode: "export_invalid_error_code",
  InvalidErrorReason: "export_invalid_error_reason",
  InvalidArtifactKey: "export_invalid_artifact_key",
  InvalidKeyword: "export_invalid_keyword",
  InvalidDateRange: "export_invalid_date_range",
  ScopeTargetMismatch: "export_scope_target_mismatch",
  IllegalTransition: "export_illegal_transition",
  InvalidStateForRetry: "export_invalid_state_for_retry",
  CompletedMissingArtifact: "export_completed_missing_artifact",
  QuotaExceeded: "export_quota_exceeded",
  Unauthorized: "export_unauthorized",
  PdfNotImplemented: "pdf_export_not_implemented_in_mvp",
} as const;

export type ExportErrorCode =
  (typeof ExportErrorCode)[keyof typeof ExportErrorCode];
