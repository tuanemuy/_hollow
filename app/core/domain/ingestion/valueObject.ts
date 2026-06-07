import {
  type DirectoryId,
  DirectoryName,
  MAX_DIRECTORY_DEPTH,
} from "@/core/domain/directory/valueObject";
import { BusinessRuleError } from "@/core/domain/error";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import type {
  ContentHtml,
  FrontMatter,
  InternalLinkRef,
  NoteTitle,
} from "@/core/domain/note/valueObject";
import type { TagName } from "@/core/domain/tag/valueObject";
import { IngestionErrorCode } from "./errorCode";

const ORIGINAL_FILE_NAME_MAX_LENGTH = 255;
const MIME_TYPE_MAX_LENGTH = 255;
const TEMP_STORAGE_KEY_MAX_LENGTH = 1024;
const ERROR_REASON_MAX_LENGTH = 2048;
const ERROR_CODE_MAX_LENGTH = 128;
// Conservative absolute upper bound for a single upload — far above the
// per-kind `IngestionLimits.maxBytes` cap that gates real ingestion. This
// guard exists only to reject negative / non-integer / pathologically
// large values at construction time.
const BYTE_SIZE_ABSOLUTE_MAX = 5 * 1024 * 1024 * 1024 * 1024;
// Matches the `PromptTemplate` cap in the adminSettings domain (16 KiB).
// `PromptOverride` is the per-upload literal counterpart of that template,
// so the upper bound is intentionally identical.
const PROMPT_OVERRIDE_MAX_BYTES = 16 * 1024;

/**
 * Default per-upload byte cap (50 MiB) used as `IngestionLimits.defaultMaxBytes`.
 *
 * Exported as the single source of truth so the client-side UX guard
 * (`UploadForm` validation) can reject obvious overflows before submit
 * without duplicating the literal. The authoritative per-kind enforcement
 * still happens server-side via `IngestionService.assertWithinLimits`.
 */
export const DEFAULT_MAX_INGESTION_BYTES = 50 * 1024 * 1024;

declare const ingestionJobIdBrand: unique symbol;

/**
 * Identifier for an `IngestionJob`. Domain treats it as an opaque,
 * non-empty string; format (UUIDv7 in this template) is owned by
 * `IdGenerator` and re-validated by storage adapters on rehydration.
 */
export type IngestionJobId = string & {
  readonly [ingestionJobIdBrand]: true;
};

export const IngestionJobId = {
  create: (id: string): IngestionJobId => {
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidId,
        "Invalid ingestion job id",
      );
    }
    return trimmed as IngestionJobId;
  },
};

// ---------- IngestionStatus ----------

const INGESTION_STATUSES = [
  "pending",
  "processing",
  "previewing",
  "saved",
  "failed",
  "discarded",
] as const;

export type IngestionStatus = (typeof INGESTION_STATUSES)[number];

export const IngestionStatus = {
  values: INGESTION_STATUSES,
  create: (raw: string): IngestionStatus => {
    if (!(INGESTION_STATUSES as readonly string[]).includes(raw)) {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidStatus,
        `Invalid ingestion status: ${raw}`,
      );
    }
    return raw as IngestionStatus;
  },
};

// ---------- SourceFileKind ----------

const SOURCE_FILE_KINDS = [
  "html",
  "markdown",
  "office",
  "pdfTextual",
  "pdfScanned",
  "image",
  "audio",
  "plain",
] as const;

export type SourceFileKind = (typeof SOURCE_FILE_KINDS)[number];

export const SourceFileKind = {
  values: SOURCE_FILE_KINDS,
  create: (raw: string): SourceFileKind => {
    if (!(SOURCE_FILE_KINDS as readonly string[]).includes(raw)) {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidSourceFileKind,
        `Invalid source file kind: ${raw}`,
      );
    }
    return raw as SourceFileKind;
  },
};

// ---------- OriginalFileName ----------

declare const originalFileNameBrand: unique symbol;

export type OriginalFileName = string & {
  readonly [originalFileNameBrand]: true;
};

export const OriginalFileName = {
  create: (raw: string): OriginalFileName => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidFileName,
        "Original file name cannot be empty",
      );
    }
    if (trimmed.length > ORIGINAL_FILE_NAME_MAX_LENGTH) {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidFileName,
        `Original file name exceeds maximum length (${ORIGINAL_FILE_NAME_MAX_LENGTH})`,
      );
    }
    return trimmed as OriginalFileName;
  },
};

// ---------- MimeType ----------

declare const mimeTypeBrand: unique symbol;

export type MimeType = string & { readonly [mimeTypeBrand]: true };

export const MimeType = {
  create: (raw: string): MimeType => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidMimeType,
        "Mime type cannot be empty",
      );
    }
    if (trimmed.length > MIME_TYPE_MAX_LENGTH) {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidMimeType,
        `Mime type exceeds maximum length (${MIME_TYPE_MAX_LENGTH})`,
      );
    }
    if (!/^[\w.+-]+\/[\w.+-]+$/.test(trimmed)) {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidMimeType,
        `Invalid mime type: ${trimmed}`,
      );
    }
    return trimmed as MimeType;
  },
};

// ---------- TempStorageKey ----------

declare const tempStorageKeyBrand: unique symbol;

export type TempStorageKey = string & {
  readonly [tempStorageKeyBrand]: true;
};

export const TempStorageKey = {
  create: (raw: string): TempStorageKey => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidTempStorageKey,
        "Temp storage key cannot be empty",
      );
    }
    if (trimmed.length > TEMP_STORAGE_KEY_MAX_LENGTH) {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidTempStorageKey,
        `Temp storage key exceeds maximum length (${TEMP_STORAGE_KEY_MAX_LENGTH})`,
      );
    }
    return trimmed as TempStorageKey;
  },
};

// ---------- RegenerationCount ----------

declare const regenerationCountBrand: unique symbol;

/**
 * Monotonic counter of how many times the preview has been regenerated
 * for a given job. Bounded above by `IngestionLimits.maxRegenerations`;
 * the cap check is enforced at the entity transition level
 * (`IngestionJob.regenerate`), not at construction.
 */
export type RegenerationCount = number & {
  readonly [regenerationCountBrand]: true;
};

export const RegenerationCount = {
  initial: (): RegenerationCount => 0 as RegenerationCount,
  create: (raw: number): RegenerationCount => {
    if (!Number.isInteger(raw) || raw < 0) {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidRegenerationCount,
        `Invalid regeneration count: ${raw}`,
      );
    }
    return raw as RegenerationCount;
  },
  next: (v: RegenerationCount): RegenerationCount =>
    ((v as number) + 1) as RegenerationCount,
};

// ---------- IngestionErrorReason / IngestionFailureCode ----------

/**
 * Free-form, user-visible reason text attached when a job transitions to
 * `failed`. Stored verbatim alongside the structured `errorCode` so
 * support tooling can surface both an enumerable code and a hint.
 */
export function validateErrorReason(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new BusinessRuleError(
      IngestionErrorCode.InvalidErrorReason,
      "Error reason cannot be empty",
    );
  }
  if (trimmed.length > ERROR_REASON_MAX_LENGTH) {
    throw new BusinessRuleError(
      IngestionErrorCode.InvalidErrorReason,
      `Error reason exceeds maximum length (${ERROR_REASON_MAX_LENGTH})`,
    );
  }
  return trimmed;
}

export function validateFailureCode(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new BusinessRuleError(
      IngestionErrorCode.InvalidErrorCode,
      "Failure code cannot be empty",
    );
  }
  if (trimmed.length > ERROR_CODE_MAX_LENGTH) {
    throw new BusinessRuleError(
      IngestionErrorCode.InvalidErrorCode,
      `Failure code exceeds maximum length (${ERROR_CODE_MAX_LENGTH})`,
    );
  }
  return trimmed;
}

/** Validates `byteSize` as a non-negative finite integer. */
export function validateByteSize(raw: number): number {
  if (!Number.isInteger(raw) || raw < 0 || raw > BYTE_SIZE_ABSOLUTE_MAX) {
    throw new BusinessRuleError(
      IngestionErrorCode.InvalidByteSize,
      `Invalid byte size: ${raw}`,
    );
  }
  return raw;
}

// ---------- IngestionLimits ----------

declare const ingestionLimitsBrand: unique symbol;

/**
 * Per-kind upload-size and regeneration policy.
 *
 * `maxBytesByKind` overrides `defaultMaxBytes` per `SourceFileKind`;
 * missing entries fall back to `defaultMaxBytes`. Both caps are bytes.
 */
export type IngestionLimits = Readonly<{
  defaultMaxBytes: number;
  maxBytesByKind: Readonly<Partial<Record<SourceFileKind, number>>>;
  maxRegenerations: number;
}> & { readonly [ingestionLimitsBrand]: true };

function ensureNonNegativeInteger(field: string, value: number): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new BusinessRuleError(
      IngestionErrorCode.InvalidIngestionLimits,
      `Invalid ingestion limit ${field}: ${value}`,
    );
  }
}

function ensurePositiveInteger(field: string, value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new BusinessRuleError(
      IngestionErrorCode.InvalidIngestionLimits,
      `Invalid ingestion limit ${field}: ${value}`,
    );
  }
}

export const IngestionLimits = {
  /**
   * Default limits per the domain spec: 50 MiB upload cap, 5 regenerations.
   */
  defaults: (): IngestionLimits =>
    ({
      defaultMaxBytes: DEFAULT_MAX_INGESTION_BYTES,
      maxBytesByKind: Object.freeze({}),
      maxRegenerations: 5,
    }) as unknown as IngestionLimits,

  create: (params: {
    defaultMaxBytes: number;
    maxBytesByKind?: Partial<Record<SourceFileKind, number>>;
    maxRegenerations: number;
  }): IngestionLimits => {
    ensurePositiveInteger("defaultMaxBytes", params.defaultMaxBytes);
    ensureNonNegativeInteger("maxRegenerations", params.maxRegenerations);
    const perKind: Partial<Record<SourceFileKind, number>> = {};
    for (const [kind, bytes] of Object.entries(params.maxBytesByKind ?? {})) {
      if (bytes === undefined) continue;
      ensurePositiveInteger(`maxBytesByKind[${kind}]`, bytes);
      perKind[kind as SourceFileKind] = bytes;
    }
    return {
      defaultMaxBytes: params.defaultMaxBytes,
      maxBytesByKind: Object.freeze(perKind),
      maxRegenerations: params.maxRegenerations,
    } as unknown as IngestionLimits;
  },

  /** Resolves the byte cap for `kind`, falling back to `defaultMaxBytes`. */
  maxBytesFor: (limits: IngestionLimits, kind: SourceFileKind): number =>
    limits.maxBytesByKind[kind] ?? limits.defaultMaxBytes,
};

// ---------- IngestionPreview ----------

declare const ingestionPreviewBrand: unique symbol;

/**
 * Snapshot of the LLM-structured note proposal held by a job between
 * `processing → previewing` and the user's commit / regenerate decision.
 *
 * Nominally a value object — equality is structural — but stored
 * inside the `IngestionJob` aggregate rather than persisted standalone.
 * Each branded VO inside (e.g. `ContentHtml`) is validated by its owning
 * domain; this brand only attests that the bundle itself was assembled
 * via this factory.
 */
export type IngestionPreview = Readonly<{
  title: NoteTitle;
  contentHtml: ContentHtml;
  suggestedDirectoryId: DirectoryId | null;
  /**
   * Canonical `/`-delimited new directory path to create on commit when no
   * existing directory matched (root excluded, no leading slash, e.g.
   * `親/子`). A single segment (no `/`) is a top-level directory; `null`
   * means "no new path proposed". The commit path splits this into a
   * `DirectoryName[]` and ensures each segment in turn (see
   * `DirectoryService.ensureNestedPath`).
   */
  suggestedDirectoryName: string | null;
  frontMatter: FrontMatter;
  suggestedTagNames: readonly TagName[];
  internalLinkRefs: readonly InternalLinkRef[];
  mediaRefs: readonly MediaAssetId[];
}> & { readonly [ingestionPreviewBrand]: true };

/**
 * Best-effort canonicalisation of a proposed new directory path into a
 * `/`-delimited string with the virtual root excluded.
 *
 * Splits on `/`, trims each segment, drops empties, then validates every
 * segment via `DirectoryName.create` (length / forbidden chars) and caps
 * the segment count at `MAX_DIRECTORY_DEPTH`. Any violation (over-long
 * segment, forbidden char, too deep, or nothing left after trimming)
 * yields `null` rather than throwing — an over-eager LLM proposal must
 * not fail the whole ingestion job (ADR-003). The case of each surviving
 * segment is preserved so the created directory keeps its display name.
 */
function canonicalizeSuggestedDirectoryPath(raw: string | null): string | null {
  if (raw === null) return null;
  const segments = raw
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  if (segments.length === 0 || segments.length > MAX_DIRECTORY_DEPTH) {
    return null;
  }
  for (const segment of segments) {
    try {
      DirectoryName.create(segment);
    } catch {
      return null;
    }
  }
  return segments.join("/");
}

export const IngestionPreview = {
  create: (params: {
    title: NoteTitle;
    contentHtml: ContentHtml;
    suggestedDirectoryId: DirectoryId | null;
    suggestedDirectoryName: string | null;
    frontMatter: FrontMatter;
    suggestedTagNames: readonly TagName[];
    internalLinkRefs: readonly InternalLinkRef[];
    mediaRefs: readonly MediaAssetId[];
  }): IngestionPreview => {
    const suggestedName = canonicalizeSuggestedDirectoryPath(
      params.suggestedDirectoryName,
    );
    return {
      title: params.title,
      contentHtml: params.contentHtml,
      suggestedDirectoryId: params.suggestedDirectoryId,
      suggestedDirectoryName: suggestedName,
      frontMatter: params.frontMatter,
      suggestedTagNames: Object.freeze([...params.suggestedTagNames]),
      internalLinkRefs: Object.freeze([...params.internalLinkRefs]),
      mediaRefs: Object.freeze([...params.mediaRefs]),
    } as unknown as IngestionPreview;
  },
};

// ---------- PromptOverride ----------

declare const promptOverrideBrand: unique symbol;

/**
 * Per-upload custom prompt body that supersedes the resolver-provided
 * template for one ingestion job. Unlike `adminSettings.PromptTemplate`
 * this is an already-interpolated literal — no `{{variable}}` validation
 * — but shares the same 16 KiB byte cap. Callers are responsible for
 * treating empty input as "no override" (see `IngestionJob.create`); this
 * factory assumes a non-empty body.
 */
export type PromptOverride = string & {
  readonly [promptOverrideBrand]: true;
};

export const PromptOverride = {
  maxBytes: PROMPT_OVERRIDE_MAX_BYTES,
  create: (raw: string): PromptOverride => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidPromptOverride,
        "Prompt override cannot be empty",
      );
    }
    if (new TextEncoder().encode(trimmed).length > PROMPT_OVERRIDE_MAX_BYTES) {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidPromptOverride,
        `Prompt override exceeds maximum size (${PROMPT_OVERRIDE_MAX_BYTES} bytes)`,
      );
    }
    return trimmed as PromptOverride;
  },
};
