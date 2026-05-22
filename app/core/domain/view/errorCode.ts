export const ViewErrorCode = {
  InvalidId: "view_invalid_id",
  NameEmpty: "view_name_empty",
  NameTooLong: "view_name_too_long",
  NameConflict: "saved_view_name_conflict",
  InvalidKind: "view_invalid_kind",
  InvalidDisplayMode: "view_invalid_display_mode",
  InvalidCalendarDateKey: "view_invalid_calendar_date_key",
  InvalidSortBy: "view_invalid_sort_by",
  InvalidSortDirection: "view_invalid_sort_direction",
  InvalidBrokenMarkerKind: "view_invalid_broken_marker_kind",
  KeywordTooLong: "view_keyword_too_long",
  KeywordEmpty: "view_keyword_empty",
  InvalidDateRange: "view_invalid_date_range",
} as const;

export type ViewErrorCode = (typeof ViewErrorCode)[keyof typeof ViewErrorCode];
