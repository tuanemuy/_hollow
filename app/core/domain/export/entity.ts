import type { WithEventDrafts } from "@/core/domain/common/event";
import { Version } from "@/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ExportErrorCode } from "./errorCode";
import { type ExportEvent, ExportEvents } from "./events";
import {
  type ExportFormat,
  ExportFormat as ExportFormatVO,
  ExportJobId,
  type ExportOptions,
  ExportProgress,
  type ExportScope,
  ExportScope as ExportScopeVO,
  type ExportStatus,
  ExportStatus as ExportStatusVO,
  PdfPaperSize,
  type ViewQuerySnapshot,
  validateArtifactKey,
  validateArtifactSize,
  validateErrorCode,
  validateErrorReason,
  validateTtlSec,
} from "./valueObject";

type ExportJobBase = Readonly<{
  id: ExportJobId;
  ownerId: UserId;
  format: ExportFormat;
  scope: ExportScope;
  targetNoteIds: readonly NoteId[];
  viewQuery: ViewQuerySnapshot | null;
  options: ExportOptions;
  progress: ExportProgress;
  failedNoteIds: readonly NoteId[];
  version: Version;
  createdAt: Date;
  updatedAt: Date;
}>;

export type PendingExportJob = ExportJobBase &
  Readonly<{
    status: "pending";
    artifactKey: null;
    artifactSize: null;
    errorCode: null;
    errorReason: null;
    completedAt: null;
    expiresAt: null;
  }>;

export type ProcessingExportJob = ExportJobBase &
  Readonly<{
    status: "processing";
    artifactKey: null;
    artifactSize: null;
    errorCode: null;
    errorReason: null;
    completedAt: null;
    expiresAt: null;
  }>;

export type CompletedExportJob = ExportJobBase &
  Readonly<{
    status: "completed";
    artifactKey: string;
    artifactSize: number;
    errorCode: null;
    errorReason: null;
    completedAt: Date;
    expiresAt: Date;
  }>;

export type FailedExportJob = ExportJobBase &
  Readonly<{
    status: "failed";
    artifactKey: null;
    artifactSize: null;
    errorCode: string;
    errorReason: string;
    completedAt: Date;
    expiresAt: null;
  }>;

export type CancelledExportJob = ExportJobBase &
  Readonly<{
    status: "cancelled";
    artifactKey: null;
    artifactSize: null;
    errorCode: null;
    errorReason: null;
    completedAt: Date;
    expiresAt: null;
  }>;

export type ExpiredExportJob = ExportJobBase &
  Readonly<{
    status: "expired";
    artifactKey: string;
    artifactSize: number;
    errorCode: null;
    errorReason: null;
    completedAt: Date;
    expiresAt: Date;
  }>;

export type ExportJob =
  | PendingExportJob
  | ProcessingExportJob
  | CompletedExportJob
  | FailedExportJob
  | CancelledExportJob
  | ExpiredExportJob;

type CreateInput = Readonly<{
  id: string;
  ownerId: UserId;
  format: ExportFormat;
  scope: ExportScope;
  targetNoteIds: readonly NoteId[];
  viewQuery: ViewQuerySnapshot | null;
  options: ExportOptions;
}>;

// Loose-typed because adapters feed untrusted persistence rows; each
// field is re-validated inside `reconstruct`.
type ReconstructInput = Readonly<{
  id: string;
  ownerId: string;
  format: string;
  scope: string;
  targetNoteIds: readonly string[];
  viewQuery: ViewQuerySnapshot | null;
  options: ExportOptions;
  status: string;
  artifactKey: string | null;
  artifactSize: number | null;
  errorCode: string | null;
  errorReason: string | null;
  progress: { processed: number; total: number };
  failedNoteIds: readonly string[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
}>;

function assertScopeTargetShape(
  scope: ExportScope,
  targetNoteIds: readonly NoteId[],
  viewQuery: ViewQuerySnapshot | null,
): void {
  switch (scope) {
    case "single": {
      if (targetNoteIds.length !== 1 || viewQuery !== null) {
        throw new BusinessRuleError(
          ExportErrorCode.ScopeTargetMismatch,
          "scope='single' requires exactly one target note and no viewQuery",
        );
      }
      return;
    }
    case "multiple": {
      if (targetNoteIds.length === 0 || viewQuery !== null) {
        throw new BusinessRuleError(
          ExportErrorCode.ScopeTargetMismatch,
          "scope='multiple' requires at least one target note and no viewQuery",
        );
      }
      return;
    }
    case "view": {
      if (viewQuery === null || targetNoteIds.length !== 0) {
        throw new BusinessRuleError(
          ExportErrorCode.ScopeTargetMismatch,
          "scope='view' requires a viewQuery and no pre-resolved target notes",
        );
      }
      return;
    }
  }
}

function assertPdfOptions(format: ExportFormat, options: ExportOptions): void {
  if (format === "pdf") {
    if (options.pdfPaperSize === null) {
      throw new BusinessRuleError(
        ExportErrorCode.InvalidPaperSize,
        "format='pdf' requires options.pdfPaperSize",
      );
    }
    return;
  }
  if (options.pdfPaperSize !== null) {
    throw new BusinessRuleError(
      ExportErrorCode.InvalidPaperSize,
      `options.pdfPaperSize must be null for format='${format}'`,
    );
  }
}

function illegalTransition(from: ExportStatus, to: ExportStatus): never {
  throw new BusinessRuleError(
    ExportErrorCode.IllegalTransition,
    `Illegal ExportJob transition: ${from} -> ${to}`,
  );
}

function startProcessing(
  job: PendingExportJob,
  total: number,
  now: Date,
): WithEventDrafts<ProcessingExportJob, ExportEvent> {
  const progress = ExportProgress.create(0, total);
  const next: ProcessingExportJob = {
    ...job,
    status: "processing",
    progress,
    version: Version.next(job.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [ExportEvents.started(next.id, total, now)],
  };
}

function recordProgress(
  job: ProcessingExportJob,
  processed: number,
  now: Date,
): WithEventDrafts<ProcessingExportJob, ExportEvent> {
  const progress = ExportProgress.create(processed, job.progress.total);
  const next: ProcessingExportJob = {
    ...job,
    progress,
    version: Version.next(job.version),
    updatedAt: now,
  };
  return { entity: next, eventDrafts: [] };
}

function recordFailedNote(
  job: ProcessingExportJob,
  noteId: NoteId,
  now: Date,
): WithEventDrafts<ProcessingExportJob, ExportEvent> {
  if (job.failedNoteIds.includes(noteId)) {
    return { entity: job, eventDrafts: [] };
  }
  const next: ProcessingExportJob = {
    ...job,
    failedNoteIds: [...job.failedNoteIds, noteId],
    version: Version.next(job.version),
    updatedAt: now,
  };
  return { entity: next, eventDrafts: [] };
}

function complete(
  job: ProcessingExportJob,
  artifactKey: string,
  artifactSize: number,
  now: Date,
  ttlSec: number,
): WithEventDrafts<CompletedExportJob, ExportEvent> {
  const key = validateArtifactKey(artifactKey);
  const size = validateArtifactSize(artifactSize);
  const ttl = validateTtlSec(ttlSec);
  const expiresAt = new Date(now.getTime() + ttl * 1000);
  const next: CompletedExportJob = {
    ...job,
    status: "completed",
    artifactKey: key,
    artifactSize: size,
    completedAt: now,
    expiresAt,
    version: Version.next(job.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [ExportEvents.completed(next.id, key, size, now)],
  };
}

function fail(
  job: PendingExportJob | ProcessingExportJob,
  code: string,
  reason: string,
  now: Date,
): WithEventDrafts<FailedExportJob, ExportEvent> {
  const normalizedCode = validateErrorCode(code);
  const normalizedReason = validateErrorReason(reason);
  const next: FailedExportJob = {
    ...job,
    status: "failed",
    errorCode: normalizedCode,
    errorReason: normalizedReason,
    completedAt: now,
    version: Version.next(job.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [
      ExportEvents.failed(next.id, normalizedCode, normalizedReason, now),
    ],
  };
}

function cancel(
  job: PendingExportJob | ProcessingExportJob,
  now: Date,
): WithEventDrafts<CancelledExportJob, ExportEvent> {
  const next: CancelledExportJob = {
    ...job,
    status: "cancelled",
    completedAt: now,
    version: Version.next(job.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [ExportEvents.cancelled(next.id, now)],
  };
}

function expire(
  job: CompletedExportJob,
  now: Date,
): WithEventDrafts<ExpiredExportJob, ExportEvent> {
  const next: ExpiredExportJob = {
    ...job,
    status: "expired",
    version: Version.next(job.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [ExportEvents.expired(next.id, now)],
  };
}

function assertOwnedBy(job: ExportJob, userId: UserId): void {
  if (job.ownerId !== userId) {
    throw new BusinessRuleError(
      ExportErrorCode.Unauthorized,
      `ExportJob ${job.id} is not owned by ${userId}`,
    );
  }
}

function reconstructByStatus(
  base: ExportJobBase,
  status: ExportStatus,
  args: {
    artifactKey: string | null;
    artifactSize: number | null;
    errorCode: string | null;
    errorReason: string | null;
    completedAt: Date | null;
    expiresAt: Date | null;
  },
): ExportJob {
  switch (status) {
    case "pending": {
      if (
        args.artifactKey !== null ||
        args.artifactSize !== null ||
        args.errorCode !== null ||
        args.errorReason !== null ||
        args.completedAt !== null ||
        args.expiresAt !== null
      ) {
        throw new BusinessRuleError(
          ExportErrorCode.InvalidStatus,
          "Pending export job must not carry artifact / error / completion fields",
        );
      }
      return {
        ...base,
        status,
        artifactKey: null,
        artifactSize: null,
        errorCode: null,
        errorReason: null,
        completedAt: null,
        expiresAt: null,
      } satisfies PendingExportJob;
    }
    case "processing": {
      if (
        args.artifactKey !== null ||
        args.artifactSize !== null ||
        args.errorCode !== null ||
        args.errorReason !== null ||
        args.completedAt !== null ||
        args.expiresAt !== null
      ) {
        throw new BusinessRuleError(
          ExportErrorCode.InvalidStatus,
          "Processing export job must not carry artifact / error / completion fields",
        );
      }
      return {
        ...base,
        status,
        artifactKey: null,
        artifactSize: null,
        errorCode: null,
        errorReason: null,
        completedAt: null,
        expiresAt: null,
      } satisfies ProcessingExportJob;
    }
    case "completed": {
      if (
        args.artifactKey === null ||
        args.artifactSize === null ||
        args.expiresAt === null ||
        args.completedAt === null
      ) {
        throw new BusinessRuleError(
          ExportErrorCode.CompletedMissingArtifact,
          "Completed export job must have artifactKey, artifactSize, completedAt, expiresAt",
        );
      }
      if (args.errorCode !== null || args.errorReason !== null) {
        throw new BusinessRuleError(
          ExportErrorCode.InvalidStatus,
          "Completed export job must not carry error fields",
        );
      }
      return {
        ...base,
        status,
        artifactKey: validateArtifactKey(args.artifactKey),
        artifactSize: validateArtifactSize(args.artifactSize),
        errorCode: null,
        errorReason: null,
        completedAt: args.completedAt,
        expiresAt: args.expiresAt,
      } satisfies CompletedExportJob;
    }
    case "failed": {
      if (args.errorCode === null || args.errorReason === null) {
        throw new BusinessRuleError(
          ExportErrorCode.InvalidStatus,
          "Failed export job must carry errorCode and errorReason",
        );
      }
      if (
        args.artifactKey !== null ||
        args.artifactSize !== null ||
        args.expiresAt !== null
      ) {
        throw new BusinessRuleError(
          ExportErrorCode.InvalidStatus,
          "Failed export job must not carry artifact fields",
        );
      }
      if (args.completedAt === null) {
        throw new BusinessRuleError(
          ExportErrorCode.InvalidStatus,
          "Failed export job must carry completedAt",
        );
      }
      return {
        ...base,
        status,
        artifactKey: null,
        artifactSize: null,
        errorCode: validateErrorCode(args.errorCode),
        errorReason: validateErrorReason(args.errorReason),
        completedAt: args.completedAt,
        expiresAt: null,
      } satisfies FailedExportJob;
    }
    case "cancelled": {
      if (
        args.artifactKey !== null ||
        args.artifactSize !== null ||
        args.errorCode !== null ||
        args.errorReason !== null ||
        args.expiresAt !== null
      ) {
        throw new BusinessRuleError(
          ExportErrorCode.InvalidStatus,
          "Cancelled export job must not carry artifact / error fields",
        );
      }
      if (args.completedAt === null) {
        throw new BusinessRuleError(
          ExportErrorCode.InvalidStatus,
          "Cancelled export job must carry completedAt",
        );
      }
      return {
        ...base,
        status,
        artifactKey: null,
        artifactSize: null,
        errorCode: null,
        errorReason: null,
        completedAt: args.completedAt,
        expiresAt: null,
      } satisfies CancelledExportJob;
    }
    case "expired": {
      if (
        args.artifactKey === null ||
        args.artifactSize === null ||
        args.expiresAt === null ||
        args.completedAt === null
      ) {
        throw new BusinessRuleError(
          ExportErrorCode.CompletedMissingArtifact,
          "Expired export job must have artifactKey, artifactSize, completedAt, expiresAt",
        );
      }
      if (args.errorCode !== null || args.errorReason !== null) {
        throw new BusinessRuleError(
          ExportErrorCode.InvalidStatus,
          "Expired export job must not carry error fields",
        );
      }
      return {
        ...base,
        status,
        artifactKey: validateArtifactKey(args.artifactKey),
        artifactSize: validateArtifactSize(args.artifactSize),
        errorCode: null,
        errorReason: null,
        completedAt: args.completedAt,
        expiresAt: args.expiresAt,
      } satisfies ExpiredExportJob;
    }
  }
}

export const ExportJob = {
  isPending: (job: ExportJob): job is PendingExportJob =>
    job.status === "pending",
  isProcessing: (job: ExportJob): job is ProcessingExportJob =>
    job.status === "processing",
  isCompleted: (job: ExportJob): job is CompletedExportJob =>
    job.status === "completed",
  isFailed: (job: ExportJob): job is FailedExportJob => job.status === "failed",
  isCancelled: (job: ExportJob): job is CancelledExportJob =>
    job.status === "cancelled",
  isExpired: (job: ExportJob): job is ExpiredExportJob =>
    job.status === "expired",

  create: (
    params: CreateInput,
    now: Date,
  ): WithEventDrafts<PendingExportJob, ExportEvent> => {
    assertScopeTargetShape(
      params.scope,
      params.targetNoteIds,
      params.viewQuery,
    );
    assertPdfOptions(params.format, params.options);
    const job: PendingExportJob = {
      id: ExportJobId.create(params.id),
      ownerId: params.ownerId,
      format: params.format,
      scope: params.scope,
      targetNoteIds: [...params.targetNoteIds],
      viewQuery: params.viewQuery,
      options: params.options,
      status: "pending",
      artifactKey: null,
      artifactSize: null,
      errorCode: null,
      errorReason: null,
      progress: ExportProgress.initial(),
      failedNoteIds: [],
      version: Version.initial(),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      expiresAt: null,
    };
    return {
      entity: job,
      eventDrafts: [
        ExportEvents.requested(job.id, job.ownerId, job.format, job.scope, now),
      ],
    };
  },

  // Distinguished from `BusinessRuleError` so adapters can map
  // storage-row-cannot-be-rehydrated to `SystemError(DataIntegrityError)`
  // while fresh-input validation remains a 4xx user-visible failure.
  reconstruct: (input: ReconstructInput): ExportJob => {
    try {
      const status = ExportStatusVO.create(input.status);
      const base: ExportJobBase = {
        id: ExportJobId.create(input.id),
        // ownerId / noteId values are opaque to this domain; trust the
        // adapter's brand and let storage adapters re-validate via the
        // matching factories on their side.
        ownerId: input.ownerId as UserId,
        format: ExportFormatVO.create(input.format),
        scope: ExportScopeVO.create(input.scope),
        targetNoteIds: input.targetNoteIds.map((id) => id as NoteId),
        viewQuery: input.viewQuery,
        options: {
          includeFrontMatter: input.options.includeFrontMatter,
          embedMedia: input.options.embedMedia,
          pdfPaperSize:
            input.options.pdfPaperSize === null
              ? null
              : PdfPaperSize.create(input.options.pdfPaperSize),
        },
        progress: ExportProgress.create(
          input.progress.processed,
          input.progress.total,
        ),
        failedNoteIds: input.failedNoteIds.map((id) => id as NoteId),
        version: Version.create(input.version),
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      };
      assertScopeTargetShape(base.scope, base.targetNoteIds, base.viewQuery);
      assertPdfOptions(base.format, base.options);
      return reconstructByStatus(base, status, {
        artifactKey: input.artifactKey,
        artifactSize: input.artifactSize,
        errorCode: input.errorCode,
        errorReason: input.errorReason,
        completedAt: input.completedAt,
        expiresAt: input.expiresAt,
      });
    } catch (error) {
      throw new RehydrationError(
        `Failed to rehydrate ExportJob (id=${input.id})`,
        error,
      );
    }
  },

  startProcessing,
  recordProgress,
  recordFailedNote,
  complete,
  fail,
  cancel,
  expire,
  assertOwnedBy,

  /**
   * Throws an illegal-transition error for the `(from, to)` pair. Useful
   * for usecases that branch on `status` and want a uniform error when
   * the runtime status disagrees with the requested transition.
   */
  illegalTransition,
};
