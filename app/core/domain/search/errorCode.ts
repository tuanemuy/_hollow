export const SearchErrorCode = {
  InvalidNoteId: "SEARCH_INVALID_NOTE_ID",
  InvalidIndexJobId: "SEARCH_INVALID_INDEX_JOB_ID",
  InvalidVisibility: "SEARCH_INVALID_VISIBILITY",
  InvalidOp: "SEARCH_INVALID_OP",
  TitleTooLong: "SEARCH_TITLE_TOO_LONG",
  BodyTooLong: "SEARCH_BODY_TOO_LONG",
  DirectoryPathInvalid: "SEARCH_DIRECTORY_PATH_INVALID",
  KeywordEmpty: "SEARCH_KEYWORD_EMPTY",
  KeywordTooLong: "SEARCH_KEYWORD_TOO_LONG",
  LimitOutOfRange: "SEARCH_LIMIT_OUT_OF_RANGE",
  InvalidDateRange: "SEARCH_INVALID_DATE_RANGE",
  InvalidCursor: "SEARCH_INVALID_CURSOR",
  SnippetTooLong: "SEARCH_SNIPPET_TOO_LONG",
  InvalidScore: "SEARCH_INVALID_SCORE",
  InvalidAttempts: "SEARCH_INVALID_ATTEMPTS",
  LastErrorTooLong: "SEARCH_LAST_ERROR_TOO_LONG",
} as const;

export type SearchErrorCode =
  (typeof SearchErrorCode)[keyof typeof SearchErrorCode];
