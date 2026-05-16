export const TagErrorCode = {
  InvalidId: "TAG_INVALID_ID",
  NameEmpty: "TAG_NAME_EMPTY",
  NameTooLong: "TAG_NAME_TOO_LONG",
  NameInvalidChars: "TAG_NAME_INVALID_CHARS",
  NoteCountNegative: "TAG_NOTE_COUNT_NEGATIVE",
  NameNotUnique: "TAG_NAME_NOT_UNIQUE",
  MergeOwnerMismatch: "TAG_MERGE_OWNER_MISMATCH",
  MergeSameTag: "TAG_MERGE_SAME_TAG",
} as const;

export type TagErrorCode = (typeof TagErrorCode)[keyof typeof TagErrorCode];
