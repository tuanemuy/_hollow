export const ViewErrorCode = {
  InvalidId: "VIEW_INVALID_ID",
  NameEmpty: "VIEW_NAME_EMPTY",
  NameTooLong: "VIEW_NAME_TOO_LONG",
  NameConflict: "VIEW_NAME_CONFLICT",
  InvalidKind: "VIEW_INVALID_KIND",
  InvalidDisplayMode: "VIEW_INVALID_DISPLAY_MODE",
  InvalidCalendarDateKey: "VIEW_INVALID_CALENDAR_DATE_KEY",
  InvalidSortBy: "VIEW_INVALID_SORT_BY",
  InvalidSortDirection: "VIEW_INVALID_SORT_DIRECTION",
  InvalidBrokenMarkerKind: "VIEW_INVALID_BROKEN_MARKER_KIND",
  KeywordTooLong: "VIEW_KEYWORD_TOO_LONG",
  KeywordEmpty: "VIEW_KEYWORD_EMPTY",
  InvalidDateRange: "VIEW_INVALID_DATE_RANGE",
} as const;

export type ViewErrorCode = (typeof ViewErrorCode)[keyof typeof ViewErrorCode];
