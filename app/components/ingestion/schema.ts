import { z } from "zod";

export const commitIngestionPreviewSchema = z.object({
  jobId: z.string().min(1),
  title: z.string().trim().optional(),
  directoryId: z.string().min(1).optional(),
  directoryNameToCreate: z.string().trim().optional(),
  tagNames: z.array(z.string().trim().min(1)).optional(),
});

export const discardIngestionPreviewSchema = z.object({
  jobId: z.string().min(1),
});

export const regenerateIngestionPreviewSchema = z.object({
  jobId: z.string().min(1),
});
