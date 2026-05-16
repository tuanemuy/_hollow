import { z } from "zod";

export const exportFormatSchema = z.enum(["html", "markdown", "pdf"]);
export const pdfPaperSizeSchema = z.enum(["A4", "Letter"]).nullable();

const exportOptionsSchema = z.object({
  includeFrontMatter: z.boolean(),
  embedMedia: z.boolean(),
  pdfPaperSize: pdfPaperSizeSchema,
});

export const startExportSchema = z
  .object({
    noteId: z.string().min(1),
    format: exportFormatSchema,
    options: exportOptionsSchema,
  })
  .refine((v) => v.format !== "pdf" || v.options.pdfPaperSize !== null, {
    message: "pdfPaperSize is required for pdf format",
    path: ["options", "pdfPaperSize"],
  });

export const enqueueExportSchema = z
  .object({
    format: exportFormatSchema,
    scope: z.enum(["multiple", "view"]),
    noteIds: z.array(z.string().min(1)).default([]),
    options: exportOptionsSchema,
  })
  .refine((v) => v.format !== "pdf" || v.options.pdfPaperSize !== null, {
    message: "pdfPaperSize is required for pdf format",
    path: ["options", "pdfPaperSize"],
  });

export const cancelExportSchema = z.object({
  jobId: z.string().min(1),
});

export const downloadExportSchema = z.object({
  jobId: z.string().min(1),
});
