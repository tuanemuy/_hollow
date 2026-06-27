import { BYTE_SIZE_MAX } from "./schema";

/**
 * Validation result for a single media file.
 *
 * - `ok: true` → the file passed format and size checks; proceed to upload.
 *   The `kind` is the canonical form (image/video) for the presign request.
 * - `ok: false` → the file did not pass validation. The `reason` is
 *   `unsupported` (non-image/video) or `oversized` (exceeds `BYTE_SIZE_MAX`).
 *   The `sizeLabel` is present only for `oversized` (human-readable MB label).
 */
export type MediaValidationResult =
  | {
      ok: true;
      kind: "image" | "video";
    }
  | {
      ok: false;
      reason: "unsupported" | "oversized";
      sizeLabel?: string;
    };

export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Client-side validation for a single media file: format (image/video) and
 * size (≤ `BYTE_SIZE_MAX`). Single-file variant of ingestion's `validateUploadFiles`.
 *
 * Returns the canonical `kind` (image/video) on success, which can be passed
 * directly to the presign request without MIME-based re-derivation.
 *
 * @param file — the file to validate
 * @returns validation result with kind (success) or reason (failure)
 */
export function validateMediaFile(file: File): MediaValidationResult {
  // Format check: image/* or video/* MIME types.
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
    return { ok: false, reason: "unsupported" };
  }

  // Size check: must not exceed BYTE_SIZE_MAX.
  if (file.size > BYTE_SIZE_MAX) {
    return {
      ok: false,
      reason: "oversized",
      sizeLabel: formatMegabytes(file.size),
    };
  }

  // Both checks pass: derive canonical kind from MIME type.
  const kind = file.type.startsWith("video/") ? "video" : "image";
  return { ok: true, kind };
}
