export const TagMergeJobErrorCode = {
  InvalidId: "tag_merge_job_invalid_id",
  InvalidStatus: "tag_merge_job_invalid_status",
  InvalidProgress: "tag_merge_job_invalid_progress",
  IllegalTransition: "tag_merge_job_illegal_transition",
  InvalidErrorCode: "tag_merge_job_invalid_error_code",
  InvalidErrorReason: "tag_merge_job_invalid_error_reason",
  Unauthorized: "tag_merge_job_unauthorized",
} as const;

export type TagMergeJobErrorCode =
  (typeof TagMergeJobErrorCode)[keyof typeof TagMergeJobErrorCode];
