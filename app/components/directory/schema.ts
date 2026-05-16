import { z } from "zod";

export const DIRECTORY_NAME_MAX_LENGTH = 100;

export const createDirectorySchema = z.object({
  parentId: z.string().min(1).nullable().default(null),
  name: z.string().trim().min(1).max(DIRECTORY_NAME_MAX_LENGTH),
});

export const renameDirectorySchema = z.object({
  directoryId: z.string().min(1),
  newName: z.string().trim().min(1).max(DIRECTORY_NAME_MAX_LENGTH),
});

export const deleteDirectorySchema = z.object({
  directoryId: z.string().min(1),
});

export const moveDirectorySchema = z.object({
  directoryId: z.string().min(1),
  newParentId: z.string().min(1).nullable().default(null),
});
