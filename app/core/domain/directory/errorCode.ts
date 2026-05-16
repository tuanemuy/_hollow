export const DirectoryErrorCode = {
  InvalidId: "DIRECTORY_INVALID_ID",
  NameEmpty: "DIRECTORY_NAME_EMPTY",
  NameTooLong: "DIRECTORY_NAME_TOO_LONG",
  NameForbiddenCharacter: "DIRECTORY_NAME_FORBIDDEN_CHARACTER",
  NameConflict: "directory_name_conflict",
  TooDeep: "directory_too_deep",
  CyclicMove: "directory_cyclic_move",
  CannotRenameRoot: "cannot_rename_root",
  CannotDeleteRoot: "cannot_delete_root",
  CannotMoveRoot: "cannot_move_root",
  RootMustHaveNoParent: "directory_root_must_have_no_parent",
  NonRootMustHaveParent: "directory_non_root_must_have_parent",
  DepthMismatch: "directory_depth_mismatch",
  InvalidSlug: "DIRECTORY_INVALID_SLUG",
} as const;

export type DirectoryErrorCode =
  (typeof DirectoryErrorCode)[keyof typeof DirectoryErrorCode];
