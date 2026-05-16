import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { BusinessRuleError } from "@/core/domain/error";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { ExportErrorCode } from "./errorCode";

const ARTIFACT_KEY_MAX_LENGTH = 1024;
const ERROR_REASON_MAX_LENGTH = 1024;
const ERROR_CODE_MAX_LENGTH = 128;
const KEYWORD_MAX_LENGTH = 200;

declare const exportJobIdBrand: unique symbol;

/**
 * Opaque, non-empty identifier for an `ExportJob`. The id format
 * (UUIDv7 in this template) is owned by `IdGenerator` and re-validated
 * by storage adapters on rehydration.
 */
export type ExportJobId = string & { readonly [exportJobIdBrand]: true };

export const ExportJobId = {
  create: (id: string): ExportJobId => {
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        ExportErrorCode.InvalidId,
        "Invalid export job id",
      );
    }
    return trimmed as ExportJobId;
  },
};

export type ExportFormat = "html" | "markdown" | "pdf";

export const ExportFormat = {
  create: (raw: string): ExportFormat => {
    if (raw !== "html" && raw !== "markdown" && raw !== "pdf") {
      throw new BusinessRuleError(
        ExportErrorCode.InvalidFormat,
        `Invalid export format: ${raw}`,
      );
    }
    return raw;
  },
};

export type ExportScope = "single" | "multiple" | "view";

export const ExportScope = {
  create: (raw: string): ExportScope => {
    if (raw !== "single" && raw !== "multiple" && raw !== "view") {
      throw new BusinessRuleError(
        ExportErrorCode.InvalidScope,
        `Invalid export scope: ${raw}`,
      );
    }
    return raw;
  },
};

export type ExportStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";

export const ExportStatus = {
  create: (raw: string): ExportStatus => {
    if (
      raw !== "pending" &&
      raw !== "processing" &&
      raw !== "completed" &&
      raw !== "failed" &&
      raw !== "cancelled" &&
      raw !== "expired"
    ) {
      throw new BusinessRuleError(
        ExportErrorCode.InvalidStatus,
        `Invalid export status: ${raw}`,
      );
    }
    return raw;
  },
};

export type PdfPaperSize = "A4" | "Letter";

export const PdfPaperSize = {
  create: (raw: string): PdfPaperSize => {
    if (raw !== "A4" && raw !== "Letter") {
      throw new BusinessRuleError(
        ExportErrorCode.InvalidPaperSize,
        `Invalid pdf paper size: ${raw}`,
      );
    }
    return raw;
  },
};

/**
 * Format-orthogonal flags carried by every export job.
 *
 * `pdfPaperSize` is `null` for non-PDF formats; when `format === 'pdf'`
 * the entity factory enforces a non-null value at construction.
 */
export type ExportOptions = Readonly<{
  includeFrontMatter: boolean;
  embedMedia: boolean;
  pdfPaperSize: PdfPaperSize | null;
}>;

export const ExportOptions = {
  create: (params: {
    includeFrontMatter: boolean;
    embedMedia: boolean;
    pdfPaperSize: PdfPaperSize | null;
  }): ExportOptions => ({
    includeFrontMatter: params.includeFrontMatter,
    embedMedia: params.embedMedia,
    pdfPaperSize: params.pdfPaperSize,
  }),

  equals: (a: ExportOptions, b: ExportOptions): boolean =>
    a.includeFrontMatter === b.includeFrontMatter &&
    a.embedMedia === b.embedMedia &&
    a.pdfPaperSize === b.pdfPaperSize,
};

/**
 * Half-open / closed instant pair captured at export request time.
 *
 * The export domain owns its own copy until a shared `DateRange`
 * primitive emerges in `common/`. Both endpoints are optional —
 * `from === null` means open-start and `to === null` means
 * open-end — but if both are present `from` must not be after `to`.
 */
export type DateRange = Readonly<{
  from: Date | null;
  to: Date | null;
}>;

export const DateRange = {
  create: (params: { from: Date | null; to: Date | null }): DateRange => {
    if (
      params.from !== null &&
      params.to !== null &&
      params.from.getTime() > params.to.getTime()
    ) {
      throw new BusinessRuleError(
        ExportErrorCode.InvalidDateRange,
        "DateRange.from must not be after DateRange.to",
      );
    }
    return { from: params.from, to: params.to };
  },

  equals: (a: DateRange, b: DateRange): boolean => {
    const left =
      (a.from === null && b.from === null) ||
      (a.from !== null &&
        b.from !== null &&
        a.from.getTime() === b.from.getTime());
    const right =
      (a.to === null && b.to === null) ||
      (a.to !== null && b.to !== null && a.to.getTime() === b.to.getTime());
    return left && right;
  },
};

/**
 * Snapshot of a `SavedView`-style query, captured at the moment the
 * export was requested so the result is reproducible even if the
 * underlying view is later edited or deleted.
 *
 * Stored by value (no references to the SavedView aggregate). The
 * resolver in `ExportService.resolveTargetNotes` re-executes the
 * query against `NoteRepository` / `TagRepository` at processing
 * time.
 */
export type ViewQuerySnapshot = Readonly<{
  directoryId: DirectoryId | null;
  tagIds: readonly TagId[];
  dateRange: DateRange | null;
  keyword: string | null;
  referencingNoteId: NoteId | null;
}>;

function validateKeyword(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > KEYWORD_MAX_LENGTH) {
    throw new BusinessRuleError(
      ExportErrorCode.InvalidKeyword,
      `keyword exceeds maximum length (${KEYWORD_MAX_LENGTH})`,
    );
  }
  return trimmed;
}

export const ViewQuerySnapshot = {
  create: (params: {
    directoryId: DirectoryId | null;
    tagIds: readonly TagId[];
    dateRange: DateRange | null;
    keyword: string | null;
    referencingNoteId: NoteId | null;
  }): ViewQuerySnapshot => ({
    directoryId: params.directoryId,
    tagIds: [...params.tagIds],
    dateRange: params.dateRange,
    keyword: validateKeyword(params.keyword),
    referencingNoteId: params.referencingNoteId,
  }),

  equals: (a: ViewQuerySnapshot, b: ViewQuerySnapshot): boolean => {
    if (a.directoryId !== b.directoryId) return false;
    if (a.tagIds.length !== b.tagIds.length) return false;
    for (let i = 0; i < a.tagIds.length; i++) {
      if (a.tagIds[i] !== b.tagIds[i]) return false;
    }
    if (a.dateRange === null && b.dateRange !== null) return false;
    if (a.dateRange !== null && b.dateRange === null) return false;
    if (
      a.dateRange !== null &&
      b.dateRange !== null &&
      !DateRange.equals(a.dateRange, b.dateRange)
    ) {
      return false;
    }
    if (a.keyword !== b.keyword) return false;
    if (a.referencingNoteId !== b.referencingNoteId) return false;
    return true;
  },
};

/**
 * Progress counter carried inside a processing job. Invariant:
 * `0 <= processed <= total`.
 */
export type ExportProgress = Readonly<{
  processed: number;
  total: number;
}>;

export const ExportProgress = {
  initial: (): ExportProgress => ({ processed: 0, total: 0 }),
  create: (processed: number, total: number): ExportProgress => {
    if (!Number.isInteger(processed) || processed < 0) {
      throw new BusinessRuleError(
        ExportErrorCode.InvalidProgress,
        `Invalid processed count: ${processed}`,
      );
    }
    if (!Number.isInteger(total) || total < 0) {
      throw new BusinessRuleError(
        ExportErrorCode.InvalidProgress,
        `Invalid total count: ${total}`,
      );
    }
    if (processed > total) {
      throw new BusinessRuleError(
        ExportErrorCode.InvalidProgress,
        `processed (${processed}) cannot exceed total (${total})`,
      );
    }
    return { processed, total };
  },
};

/**
 * Quota envelope used by `ExportService.enforceQuota`. The exact
 * meanings (per-day count, per-user concurrent jobs, etc.) are
 * application-configuration concerns; the service treats both as
 * upper bounds compared against the supplied `currentUserUsage`.
 */
export type ExportLimits = Readonly<{
  maxConcurrentJobs: number;
  maxJobsPerDay: number;
}>;

/**
 * Validates the storage object key produced by `ExportService.assembleArtifact`.
 * Treated as opaque here — the storage adapter chooses the exact layout.
 */
export function validateArtifactKey(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new BusinessRuleError(
      ExportErrorCode.InvalidArtifactKey,
      "Artifact key cannot be empty",
    );
  }
  if (trimmed.length > ARTIFACT_KEY_MAX_LENGTH) {
    throw new BusinessRuleError(
      ExportErrorCode.InvalidArtifactKey,
      `Artifact key exceeds maximum length (${ARTIFACT_KEY_MAX_LENGTH})`,
    );
  }
  return trimmed;
}

export function validateArtifactSize(raw: number): number {
  if (!Number.isInteger(raw) || raw < 0) {
    throw new BusinessRuleError(
      ExportErrorCode.InvalidArtifactSize,
      `Invalid artifact size: ${raw}`,
    );
  }
  return raw;
}

export function validateTtlSec(raw: number): number {
  if (!Number.isInteger(raw) || raw <= 0) {
    throw new BusinessRuleError(
      ExportErrorCode.InvalidTtl,
      `Invalid ttl seconds: ${raw}`,
    );
  }
  return raw;
}

export function validateErrorCode(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new BusinessRuleError(
      ExportErrorCode.InvalidErrorCode,
      "Error code cannot be empty",
    );
  }
  if (trimmed.length > ERROR_CODE_MAX_LENGTH) {
    throw new BusinessRuleError(
      ExportErrorCode.InvalidErrorCode,
      `Error code exceeds maximum length (${ERROR_CODE_MAX_LENGTH})`,
    );
  }
  return trimmed;
}

export function validateErrorReason(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new BusinessRuleError(
      ExportErrorCode.InvalidErrorReason,
      "Error reason cannot be empty",
    );
  }
  if (trimmed.length > ERROR_REASON_MAX_LENGTH) {
    throw new BusinessRuleError(
      ExportErrorCode.InvalidErrorReason,
      `Error reason exceeds maximum length (${ERROR_REASON_MAX_LENGTH})`,
    );
  }
  return trimmed;
}
