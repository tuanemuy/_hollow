export const TagErrorCode = {
  InvalidId: "tag_invalid_id",
  NameEmpty: "tag_name_empty",
  NameTooLong: "tag_name_too_long",
  NameInvalidChars: "tag_name_invalid_chars",
  NameNotUnique: "tag_name_conflict",
  MergeOwnerMismatch: "tag_owner_mismatch",
  MergeSameTag: "tag_merge_same",
} as const;

export type TagErrorCode = (typeof TagErrorCode)[keyof typeof TagErrorCode];
