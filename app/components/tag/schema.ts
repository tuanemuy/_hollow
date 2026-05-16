import { z } from "zod";

export const TAG_NAME_MAX_LENGTH = 64;

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(TAG_NAME_MAX_LENGTH),
});

export const renameTagSchema = z.object({
  tagId: z.string().min(1),
  newName: z.string().trim().min(1).max(TAG_NAME_MAX_LENGTH),
});

export const mergeTagsSchema = z.object({
  sourceTagId: z.string().min(1),
  targetTagId: z.string().min(1),
});

export const deleteTagSchema = z.object({
  tagId: z.string().min(1),
});
