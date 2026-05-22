export const DirectoryErrorCode = {
  InvalidId: "directory_invalid_id",
  NameEmpty: "directory_name_empty",
  NameTooLong: "directory_name_too_long",
  NameForbiddenCharacter: "directory_name_forbidden_character",
  NameConflict: "directory_name_conflict",
  TooDeep: "directory_too_deep",
  CyclicMove: "directory_cyclic_move",
  CannotRenameRoot: "cannot_rename_root",
  CannotDeleteRoot: "cannot_delete_root",
  CannotMoveRoot: "cannot_move_root",
  RootMustHaveNoParent: "directory_root_must_have_no_parent",
  NonRootMustHaveParent: "directory_non_root_must_have_parent",
  DepthMismatch: "directory_depth_mismatch",
  InvalidSlug: "directory_invalid_slug",
} as const;

export type DirectoryErrorCode =
  (typeof DirectoryErrorCode)[keyof typeof DirectoryErrorCode];
