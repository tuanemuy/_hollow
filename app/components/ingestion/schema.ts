import { z } from "zod";
import { FRONT_MATTER_JSON_MAX_BYTES } from "../note/schema";

export const commitIngestionPreviewSchema = z.object({
  jobId: z.string().min(1),
  title: z.string().trim().optional(),
  directoryId: z.string().min(1).optional(),
  directoryNameToCreate: z.string().trim().optional(),
  tagNames: z.array(z.string().trim().min(1)).optional(),
  // FrontMatter travels as a JSON string per the note-side ADR-008
  // transport contract. The handler parses it via `parseFrontMatterJson`
  // before forwarding to the usecase as `modifications.frontMatter`.
  frontMatterJson: z.string().max(FRONT_MATTER_JSON_MAX_BYTES).optional(),
});

export const discardIngestionPreviewSchema = z.object({
  jobId: z.string().min(1),
});

export const regenerateIngestionPreviewSchema = z.object({
  jobId: z.string().min(1),
});

export const ownerRetryIngestionJobSchema = z.object({
  jobId: z.string().min(1),
});

export const getIngestionJobSchema = z.object({
  jobId: z.string().min(1),
});
