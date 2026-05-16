import { BusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "./errorCode";
import type { IngestionLimits, SourceFileKind } from "./valueObject";

/**
 * Mapping of well-known MIME types to `SourceFileKind`. Anything not
 * present here falls through to the extension-based heuristic in
 * `detectKind` so that browser-reported MIME drift (e.g. `application/
 * octet-stream` for `.md`) does not silently reject the upload.
 *
 * `pdfTextual` is the optimistic default for PDFs — `PDFExtractor.extract`
 * downgrades to `pdfScanned` at processing time when it observes no
 * extractable text. Detection cannot tell them apart without reading the
 * file body.
 */
const MIME_TO_KIND: Readonly<Record<string, SourceFileKind>> = {
  "text/html": "html",
  "application/xhtml+xml": "html",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "application/markdown": "markdown",
  "text/plain": "plain",
  "application/pdf": "pdfTextual",
  "application/msword": "office",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "office",
  "application/vnd.oasis.opendocument.text": "office",
  "application/vnd.ms-excel": "office",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "office",
  "application/vnd.oasis.opendocument.spreadsheet": "office",
  "application/vnd.ms-powerpoint": "office",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "office",
  "application/vnd.oasis.opendocument.presentation": "office",
  "application/rtf": "office",
};

/**
 * MIME prefixes for media families. Used after the exact-match table.
 */
const MIME_PREFIX_TO_KIND: ReadonlyArray<readonly [string, SourceFileKind]> = [
  ["image/", "image"],
  ["audio/", "audio"],
];

/**
 * Extension fallback for environments that hand the domain layer a
 * generic `application/octet-stream`. Keys are lowercased extensions
 * without the leading dot.
 */
const EXTENSION_TO_KIND: Readonly<Record<string, SourceFileKind>> = {
  html: "html",
  htm: "html",
  md: "markdown",
  markdown: "markdown",
  txt: "plain",
  pdf: "pdfTextual",
  doc: "office",
  docx: "office",
  odt: "office",
  xls: "office",
  xlsx: "office",
  ods: "office",
  ppt: "office",
  pptx: "office",
  odp: "office",
  rtf: "office",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  tiff: "image",
  heic: "image",
  mp3: "audio",
  wav: "audio",
  m4a: "audio",
  flac: "audio",
  ogg: "audio",
  webm: "audio",
};

function extensionOf(fileName: string): string | null {
  const idx = fileName.lastIndexOf(".");
  if (idx < 0 || idx === fileName.length - 1) return null;
  return fileName.slice(idx + 1).toLowerCase();
}

/**
 * `IngestionService` collects domain rules that span more than a single
 * `IngestionJob` mutation — namely format detection and policy-driven
 * size enforcement. Both methods are pure; the heavier orchestration
 * (LLM dispatch, preview assembly, commit-to-note) lives in the
 * application layer because it composes ports across the Note / Tag /
 * Directory aggregates.
 */
export const IngestionService = {
  /**
   * Classifies an upload by MIME type with `fileName` extension as a
   * fallback for environments that report a generic content type.
   *
   * Throws `BusinessRuleError(UnsupportedFormat)` when neither signal
   * resolves to a known kind — the caller is expected to surface this
   * as a 4xx user-visible error.
   */
  detectKind(mimeType: string, fileName: string): SourceFileKind {
    const normalisedMime = mimeType.trim().toLowerCase();
    const byMime = MIME_TO_KIND[normalisedMime];
    if (byMime !== undefined) return byMime;
    for (const [prefix, kind] of MIME_PREFIX_TO_KIND) {
      if (normalisedMime.startsWith(prefix)) return kind;
    }
    const ext = extensionOf(fileName);
    if (ext !== null) {
      const byExt = EXTENSION_TO_KIND[ext];
      if (byExt !== undefined) return byExt;
    }
    throw new BusinessRuleError(
      IngestionErrorCode.UnsupportedFormat,
      `Unsupported upload format (mime=${mimeType}, file=${fileName})`,
    );
  },

  /**
   * Enforces the byte-size cap for the resolved kind. Per-kind override
   * in `limits.maxBytesByKind` wins; otherwise `defaultMaxBytes` applies.
   *
   * Throws `BusinessRuleError(ByteSizeExceedsLimit)` when the upload
   * exceeds the resolved cap. `byteSize` itself is assumed to have been
   * validated at the entity construction boundary; this method does
   * not re-check shape, only policy.
   */
  assertWithinLimits(
    kind: SourceFileKind,
    byteSize: number,
    limits: IngestionLimits,
  ): void {
    const cap = limits.maxBytesByKind[kind] ?? limits.defaultMaxBytes;
    if (byteSize > cap) {
      throw new BusinessRuleError(
        IngestionErrorCode.ByteSizeExceedsLimit,
        `Upload size ${byteSize}B exceeds the ${kind} limit of ${cap}B`,
      );
    }
  },
};
