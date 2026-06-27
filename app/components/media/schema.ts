import { z } from "zod";

const MIME_TYPE_MAX_LENGTH = 255;
/** Maximum byte size for media uploads (client and server SSOT). */
export const BYTE_SIZE_MAX = 5 * 1024 * 1024 * 1024; // 5 GiB safety cap

const mediaKindSchema = z.enum(["image", "video", "avatar"]);

export const presignMediaUploadSchema = z.object({
  kind: mediaKindSchema,
  mimeType: z.string().trim().min(1).max(MIME_TYPE_MAX_LENGTH),
  byteSize: z.number().int().positive().max(BYTE_SIZE_MAX),
});

export const finalizeMediaSchema = z.object({
  mediaId: z.string().min(1),
});
