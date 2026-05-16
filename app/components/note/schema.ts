import { z } from "zod";

export const NOTE_TITLE_MAX_LENGTH = 200;
export const NOTE_BODY_MAX_BYTES = 1024 * 1024;

export const createNoteSchema = z.object({
  title: z.string().trim().max(NOTE_TITLE_MAX_LENGTH).default(""),
  contentHtml: z.string().max(NOTE_BODY_MAX_BYTES).default(""),
  directoryId: z.string().min(1).nullable().default(null),
  tagNames: z.array(z.string().trim().min(1)).default([]),
});

export const saveNoteSchema = z.object({
  noteId: z.string().min(1),
  title: z.string().trim().max(NOTE_TITLE_MAX_LENGTH).optional(),
  contentHtml: z.string().max(NOTE_BODY_MAX_BYTES).optional(),
  tagNames: z.array(z.string().trim().min(1)).optional(),
});

export const renameNoteSchema = z.object({
  noteId: z.string().min(1),
  newTitle: z.string().trim().min(1).max(NOTE_TITLE_MAX_LENGTH),
  regenerateSlug: z.boolean().default(false),
});

export const moveNoteSchema = z.object({
  noteId: z.string().min(1),
  newDirectoryId: z.string().min(1),
});

export const deleteNoteSchema = z.object({
  noteId: z.string().min(1),
});

export const restoreNoteSchema = z.object({
  noteId: z.string().min(1),
  restoreDirectoryId: z.string().min(1).nullable().default(null),
});

export const purgeNoteSchema = z.object({
  noteId: z.string().min(1),
});

export const duplicateNoteSchema = z.object({
  noteId: z.string().min(1),
});
