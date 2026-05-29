import type { WithEventDrafts } from "@/core/domain/common/event";
import { Version } from "@/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { IngestionErrorCode } from "./errorCode";
import { type IngestionEvent, IngestionEvents } from "./events";
import {
  IngestionJobId,
  type IngestionPreview,
  IngestionStatus,
  MimeType,
  OriginalFileName,
  RegenerationCount,
  SourceFileKind,
  TempStorageKey,
  validateByteSize,
  validateErrorReason,
  validateFailureCode,
} from "./valueObject";

type IngestionJobBase = Readonly<{
  id: IngestionJobId;
  ownerId: UserId;
  originalFileName: OriginalFileName;
  mimeType: MimeType;
  byteSize: number;
  kind: SourceFileKind;
  tempStorageKey: TempStorageKey | null;
  regenerationCount: RegenerationCount;
  version: Version;
  createdAt: Date;
  updatedAt: Date;
}>;

// Discriminated union over `status`. Each variant pins which optional
// fields are present so callers cannot, e.g., read `savedAsNoteId` off a
// `processing` job — that's a type error rather than a runtime null check.

export type PendingIngestionJob = IngestionJobBase &
  Readonly<{
    status: "pending";
    preview: null;
    errorCode: null;
    errorReason: null;
    savedAsNoteId: null;
  }>;

export type ProcessingIngestionJob = IngestionJobBase &
  Readonly<{
    status: "processing";
    preview: null;
    errorCode: null;
    errorReason: null;
    savedAsNoteId: null;
  }>;

export type PreviewingIngestionJob = IngestionJobBase &
  Readonly<{
    status: "previewing";
    preview: IngestionPreview;
    errorCode: null;
    errorReason: null;
    savedAsNoteId: null;
  }>;

export type SavedIngestionJob = IngestionJobBase &
  Readonly<{
    status: "saved";
    preview: IngestionPreview;
    errorCode: null;
    errorReason: null;
    savedAsNoteId: NoteId;
  }>;

export type FailedIngestionJob = IngestionJobBase &
  Readonly<{
    status: "failed";
    preview: IngestionPreview | null;
    errorCode: string;
    errorReason: string;
    savedAsNoteId: null;
  }>;

export type DiscardedIngestionJob = IngestionJobBase &
  Readonly<{
    status: "discarded";
    preview: IngestionPreview | null;
    errorCode: string | null;
    errorReason: string | null;
    savedAsNoteId: null;
  }>;

export type IngestionJob =
  | PendingIngestionJob
  | ProcessingIngestionJob
  | PreviewingIngestionJob
  | SavedIngestionJob
  | FailedIngestionJob
  | DiscardedIngestionJob;

type CreateInput = Readonly<{
  id: string;
  ownerId: UserId;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  kind: SourceFileKind;
  tempStorageKey: string | null;
}>;

// Loose-typed: persistence rows are untrusted and re-validated below.
type ReconstructInput = Readonly<{
  id: string;
  ownerId: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  kind: string;
  status: string;
  tempStorageKey: string | null;
  preview: IngestionPreview | null;
  errorCode: string | null;
  errorReason: string | null;
  regenerationCount: number;
  savedAsNoteId: NoteId | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}>;

function startProcessing(
  job: PendingIngestionJob,
  now: Date,
): WithEventDrafts<ProcessingIngestionJob, IngestionEvent> {
  const next: ProcessingIngestionJob = {
    ...job,
    status: "processing",
    version: Version.next(job.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [IngestionEvents.processingStarted(next.id, now)],
  };
}

function attachPreview(
  job: ProcessingIngestionJob,
  preview: IngestionPreview,
  now: Date,
): WithEventDrafts<PreviewingIngestionJob, IngestionEvent> {
  const next: PreviewingIngestionJob = {
    ...job,
    status: "previewing",
    preview,
    version: Version.next(job.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [IngestionEvents.previewAttached(next.id, now)],
  };
}

function regenerate(
  job: PreviewingIngestionJob,
  now: Date,
  maxRegenerations: number,
): WithEventDrafts<PendingIngestionJob, IngestionEvent> {
  if ((job.regenerationCount as number) >= maxRegenerations) {
    throw new BusinessRuleError(
      IngestionErrorCode.RegenerationLimitExceeded,
      `Regeneration limit exceeded (max=${maxRegenerations})`,
    );
  }
  const nextCount = RegenerationCount.next(job.regenerationCount);
  // Return to `pending` (not `processing`) so the `ingestion.regenerated`
  // event, dispatched to `runIngestionJob`, passes its `isPending` guard and
  // re-drives the LLM pipeline — reusing the admin-retry path. See
  // .issue/253/adr.md ADR-001.
  const next: PendingIngestionJob = {
    ...job,
    status: "pending",
    preview: null,
    errorCode: null,
    errorReason: null,
    savedAsNoteId: null,
    regenerationCount: nextCount,
    version: Version.next(job.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [
      IngestionEvents.regenerated(next.id, nextCount as number, now),
    ],
  };
}

function commit(
  job: PreviewingIngestionJob,
  noteId: NoteId,
  now: Date,
): WithEventDrafts<SavedIngestionJob, IngestionEvent> {
  const next: SavedIngestionJob = {
    ...job,
    status: "saved",
    savedAsNoteId: noteId,
    // Temp storage is reclaimed after a successful commit; clearing the
    // key here keeps the in-memory aggregate in sync with the storage
    // adapter that physically deletes the blob.
    tempStorageKey: null,
    version: Version.next(job.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [IngestionEvents.committed(next.id, noteId, now)],
  };
}

function markFailed(
  job: PendingIngestionJob | ProcessingIngestionJob | PreviewingIngestionJob,
  code: string,
  reason: string,
  now: Date,
): WithEventDrafts<FailedIngestionJob, IngestionEvent> {
  const validatedCode = validateFailureCode(code);
  const validatedReason = validateErrorReason(reason);
  const preview = job.status === "previewing" ? job.preview : null;
  const next: FailedIngestionJob = {
    ...job,
    status: "failed",
    preview,
    errorCode: validatedCode,
    errorReason: validatedReason,
    savedAsNoteId: null,
    version: Version.next(job.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [
      IngestionEvents.failed(next.id, validatedCode, validatedReason, now),
    ],
  };
}

function retry(
  job: FailedIngestionJob,
  now: Date,
): WithEventDrafts<PendingIngestionJob, IngestionEvent> {
  // The temp blob is the only retry-able payload — once it has been
  // reclaimed, the only meaningful "retry" would be a re-upload, so
  // reject here rather than transition into a pending state we cannot
  // service.
  if (job.tempStorageKey === null) {
    throw new BusinessRuleError(
      IngestionErrorCode.NoTempStorageForRetry,
      `Cannot retry ingestion job ${job.id}: temp storage key has been reclaimed`,
    );
  }
  const next: PendingIngestionJob = {
    ...job,
    status: "pending",
    preview: null,
    errorCode: null,
    errorReason: null,
    savedAsNoteId: null,
    version: Version.next(job.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [IngestionEvents.retryRequested(next.id, now)],
  };
}

function discard(
  job: PreviewingIngestionJob | FailedIngestionJob,
  now: Date,
): WithEventDrafts<DiscardedIngestionJob, IngestionEvent> {
  const next: DiscardedIngestionJob = {
    ...job,
    status: "discarded",
    preview: job.preview,
    errorCode: job.status === "failed" ? job.errorCode : null,
    errorReason: job.status === "failed" ? job.errorReason : null,
    savedAsNoteId: null,
    // Discarded jobs release their temp blob too.
    tempStorageKey: null,
    version: Version.next(job.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [IngestionEvents.discarded(next.id, now)],
  };
}

function buildBase(
  input: Pick<
    ReconstructInput,
    | "id"
    | "ownerId"
    | "originalFileName"
    | "mimeType"
    | "byteSize"
    | "kind"
    | "tempStorageKey"
    | "regenerationCount"
    | "version"
    | "createdAt"
    | "updatedAt"
  >,
): IngestionJobBase {
  return {
    id: IngestionJobId.create(input.id),
    // `ownerId` is opaque to this domain — trust the brand at the
    // construction boundary; adapters re-validate via the canonical
    // `UserId.create` on rehydration.
    ownerId: input.ownerId as UserId,
    originalFileName: OriginalFileName.create(input.originalFileName),
    mimeType: MimeType.create(input.mimeType),
    byteSize: validateByteSize(input.byteSize),
    kind: SourceFileKind.create(input.kind),
    tempStorageKey:
      input.tempStorageKey === null
        ? null
        : TempStorageKey.create(input.tempStorageKey),
    regenerationCount: RegenerationCount.create(input.regenerationCount),
    version: Version.create(input.version),
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

function assembleByStatus(
  base: IngestionJobBase,
  status: IngestionStatus,
  preview: IngestionPreview | null,
  errorCode: string | null,
  errorReason: string | null,
  savedAsNoteId: NoteId | null,
): IngestionJob {
  switch (status) {
    case "pending": {
      return {
        ...base,
        status,
        preview: null,
        errorCode: null,
        errorReason: null,
        savedAsNoteId: null,
      } satisfies PendingIngestionJob;
    }
    case "processing": {
      return {
        ...base,
        status,
        preview: null,
        errorCode: null,
        errorReason: null,
        savedAsNoteId: null,
      } satisfies ProcessingIngestionJob;
    }
    case "previewing": {
      if (preview === null) {
        throw new BusinessRuleError(
          IngestionErrorCode.InvalidStateForAttachPreview,
          "Previewing ingestion job must carry a preview",
        );
      }
      return {
        ...base,
        status,
        preview,
        errorCode: null,
        errorReason: null,
        savedAsNoteId: null,
      } satisfies PreviewingIngestionJob;
    }
    case "saved": {
      if (preview === null) {
        throw new BusinessRuleError(
          IngestionErrorCode.InvalidStateForCommit,
          "Saved ingestion job must retain its committed preview",
        );
      }
      if (savedAsNoteId === null) {
        throw new BusinessRuleError(
          IngestionErrorCode.MissingSavedNoteId,
          "Saved ingestion job must reference the created note",
        );
      }
      return {
        ...base,
        status,
        preview,
        errorCode: null,
        errorReason: null,
        savedAsNoteId,
      } satisfies SavedIngestionJob;
    }
    case "failed": {
      const code =
        errorCode === null
          ? null
          : (validateFailureCode(errorCode) as string | null);
      const reason =
        errorReason === null ? null : validateErrorReason(errorReason);
      if (code === null || reason === null) {
        throw new BusinessRuleError(
          IngestionErrorCode.InvalidStatus,
          "Failed ingestion job must carry an error code and reason",
        );
      }
      return {
        ...base,
        status,
        preview,
        errorCode: code,
        errorReason: reason,
        savedAsNoteId: null,
      } satisfies FailedIngestionJob;
    }
    case "discarded": {
      const code = errorCode === null ? null : validateFailureCode(errorCode);
      const reason =
        errorReason === null ? null : validateErrorReason(errorReason);
      return {
        ...base,
        status,
        preview,
        errorCode: code,
        errorReason: reason,
        savedAsNoteId: null,
      } satisfies DiscardedIngestionJob;
    }
  }
}

export const IngestionJob = {
  isPending: (job: IngestionJob): job is PendingIngestionJob =>
    job.status === "pending",
  isProcessing: (job: IngestionJob): job is ProcessingIngestionJob =>
    job.status === "processing",
  isPreviewing: (job: IngestionJob): job is PreviewingIngestionJob =>
    job.status === "previewing",
  isSaved: (job: IngestionJob): job is SavedIngestionJob =>
    job.status === "saved",
  isFailed: (job: IngestionJob): job is FailedIngestionJob =>
    job.status === "failed",
  isDiscarded: (job: IngestionJob): job is DiscardedIngestionJob =>
    job.status === "discarded",

  /**
   * Initial registration of an upload. Jobs start in `pending` and the
   * worker promotes them to `processing` once it picks them up.
   */
  create: (
    params: CreateInput,
    now: Date,
  ): WithEventDrafts<PendingIngestionJob, IngestionEvent> => {
    const kind = params.kind;
    const job: PendingIngestionJob = {
      status: "pending",
      id: IngestionJobId.create(params.id),
      ownerId: params.ownerId,
      originalFileName: OriginalFileName.create(params.originalFileName),
      mimeType: MimeType.create(params.mimeType),
      byteSize: validateByteSize(params.byteSize),
      kind,
      tempStorageKey:
        params.tempStorageKey === null
          ? null
          : TempStorageKey.create(params.tempStorageKey),
      preview: null,
      errorCode: null,
      errorReason: null,
      regenerationCount: RegenerationCount.initial(),
      savedAsNoteId: null,
      version: Version.initial(),
      createdAt: now,
      updatedAt: now,
    };
    return {
      entity: job,
      eventDrafts: [IngestionEvents.created(job.id, kind, now)],
    };
  },

  startProcessing: (
    job: IngestionJob,
    now: Date,
  ): WithEventDrafts<ProcessingIngestionJob, IngestionEvent> => {
    if (job.status !== "pending") {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidStateForStart,
        `Cannot start processing from state: ${job.status}`,
      );
    }
    return startProcessing(job, now);
  },

  attachPreview: (
    job: IngestionJob,
    preview: IngestionPreview,
    now: Date,
  ): WithEventDrafts<PreviewingIngestionJob, IngestionEvent> => {
    if (job.status !== "processing") {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidStateForAttachPreview,
        `Cannot attach preview from state: ${job.status}`,
      );
    }
    return attachPreview(job, preview, now);
  },

  regenerate: (
    job: IngestionJob,
    now: Date,
    maxRegenerations: number,
  ): WithEventDrafts<PendingIngestionJob, IngestionEvent> => {
    if (job.status !== "previewing") {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidStateForRegenerate,
        `Cannot regenerate from state: ${job.status}`,
      );
    }
    return regenerate(job, now, maxRegenerations);
  },

  commit: (
    job: IngestionJob,
    noteId: NoteId,
    now: Date,
  ): WithEventDrafts<SavedIngestionJob, IngestionEvent> => {
    if (job.status !== "previewing") {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidStateForCommit,
        `Cannot commit from state: ${job.status}`,
      );
    }
    return commit(job, noteId, now);
  },

  markFailed: (
    job: IngestionJob,
    code: string,
    reason: string,
    now: Date,
  ): WithEventDrafts<FailedIngestionJob, IngestionEvent> => {
    if (
      job.status !== "pending" &&
      job.status !== "processing" &&
      job.status !== "previewing"
    ) {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidStatus,
        `Cannot mark failed from state: ${job.status}`,
      );
    }
    return markFailed(job, code, reason, now);
  },

  discard: (
    job: IngestionJob,
    now: Date,
  ): WithEventDrafts<DiscardedIngestionJob, IngestionEvent> => {
    if (job.status !== "previewing" && job.status !== "failed") {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidStateForDiscard,
        `Cannot discard from state: ${job.status}`,
      );
    }
    return discard(job, now);
  },

  /**
   * Admin-driven retry of a `failed` job. Resets `preview` / `errorCode` /
   * `errorReason` and returns the job to `pending` so the queue consumer
   * can pick it up again. Rejects when the job is not `failed`, or when
   * its `tempStorageKey` has already been reclaimed (the retry has no
   * payload to re-process).
   *
   * Note: `regenerationCount` is intentionally preserved across retry
   * (a retry must not bypass the per-job regeneration cap).
   */
  retry: (
    job: IngestionJob,
    now: Date,
  ): WithEventDrafts<PendingIngestionJob, IngestionEvent> => {
    if (job.status !== "failed") {
      throw new BusinessRuleError(
        IngestionErrorCode.InvalidStateForRetry,
        `Cannot retry from state: ${job.status}`,
      );
    }
    return retry(job, now);
  },

  // Value objects throw `BusinessRuleError` from fresh-input paths; the
  // same failure during rehydration means stored data has drifted from
  // the schema, so wrap into `RehydrationError`. Adapters translate
  // that to `SystemError(DataIntegrityError)`. The preview bundle is
  // assumed to already be a branded `IngestionPreview` — adapters are
  // expected to call `IngestionPreview.create` on each rehydrated row
  // before handing it here.
  reconstruct: (input: ReconstructInput): IngestionJob => {
    try {
      const base = buildBase(input);
      const status = IngestionStatus.create(input.status);
      return assembleByStatus(
        base,
        status,
        input.preview,
        input.errorCode,
        input.errorReason,
        input.savedAsNoteId,
      );
    } catch (error) {
      throw new RehydrationError(
        `Failed to rehydrate IngestionJob (id=${input.id})`,
        error,
      );
    }
  },
};
