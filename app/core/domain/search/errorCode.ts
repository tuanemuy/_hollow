export const SearchErrorCode = {
  InvalidNoteId: "search_invalid_note_id",
  InvalidIndexJobId: "search_invalid_index_job_id",
  InvalidVisibility: "search_invalid_visibility",
  InvalidOp: "search_invalid_op",
  TitleTooLong: "search_title_too_long",
  BodyTooLong: "search_body_too_long",
  DirectoryPathInvalid: "search_directory_path_invalid",
  KeywordEmpty: "search_keyword_empty",
  KeywordTooLong: "search_keyword_too_long",
  LimitOutOfRange: "search_limit_out_of_range",
  InvalidDateRange: "search_invalid_date_range",
  InvalidCursor: "search_invalid_cursor",
  SnippetTooLong: "search_snippet_too_long",
  InvalidScore: "search_invalid_score",
  InvalidAttempts: "search_invalid_attempts",
  LastErrorTooLong: "search_last_error_too_long",
} as const;

export type SearchErrorCode =
  (typeof SearchErrorCode)[keyof typeof SearchErrorCode];
