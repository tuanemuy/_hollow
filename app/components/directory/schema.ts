import { z } from "zod";

// Mirrors `DIRECTORY_NAME_MAX_LENGTH` in
// `app/core/domain/directory/valueObject.ts`. Keep these in lockstep —
// any divergence lets transport accept names the domain will reject,
// surfacing a generic 422 instead of a clean transport-layer field error.
export const DIRECTORY_NAME_MAX_LENGTH = 80;

// Transport-boundary shape check for directory names. Mirrors the domain
// invariant in `app/core/domain/directory/valueObject.ts` (DirectoryName)
// so obviously malformed input is rejected before reaching the use case.
// The domain layer remains the source of truth for the full set of rules.
const directoryNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(DIRECTORY_NAME_MAX_LENGTH)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: \0 is part of the domain's forbidden character set
  .regex(/^[^/\\<>:|?*\x00]+$/, "使用できない文字が含まれています");

export const createDirectorySchema = z.object({
  parentId: z.string().min(1).nullable().default(null),
  name: directoryNameSchema,
});

export const renameDirectorySchema = z.object({
  directoryId: z.string().min(1),
  newName: directoryNameSchema,
});

export const deleteDirectorySchema = z.object({
  directoryId: z.string().min(1),
});

export const moveDirectorySchema = z.object({
  directoryId: z.string().min(1),
  newParentId: z.string().min(1).nullable().default(null),
});
