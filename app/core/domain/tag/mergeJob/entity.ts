import type { WithEventDrafts } from "@/core/domain/common/event";
import { Version } from "@/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { TagMergeJobErrorCode } from "./errorCode";
import { TagMergeEvents, type TagMergeJobEvent } from "./events";
import {
  TagMergeJobId,
  TagMergeProgress,
  type TagMergeStatus,
  TagMergeStatus as TagMergeStatusVO,
  validateErrorCode,
  validateErrorReason,
} from "./valueObject";

type TagMergeJobBase = Readonly<{
  id: TagMergeJobId;
  ownerId: UserId;
  sourceTagId: TagId;
  targetTagId: TagId;
  progress: TagMergeProgress;
  version: Version;
  createdAt: Date;
  updatedAt: Date;
}>;

export type PendingTagMergeJob = TagMergeJobBase &
  Readonly<{
    status: "pending";
    affectedNoteIds: null;
    errorCode: null;
    errorReason: null;
    completedAt: null;
  }>;

export type ProcessingTagMergeJob = TagMergeJobBase &
  Readonly<{
    status: "processing";
    affectedNoteIds: null;
    errorCode: null;
    errorReason: null;
    completedAt: null;
  }>;

export type CompletedTagMergeJob = TagMergeJobBase &
  Readonly<{
    status: "completed";
    affectedNoteIds: readonly NoteId[];
    errorCode: null;
    errorReason: null;
    completedAt: Date;
  }>;

export type FailedTagMergeJob = TagMergeJobBase &
  Readonly<{
    status: "failed";
    affectedNoteIds: null;
    errorCode: string;
    errorReason: string;
    completedAt: Date;
  }>;

export type TagMergeJob =
  | PendingTagMergeJob
  | ProcessingTagMergeJob
  | CompletedTagMergeJob
  | FailedTagMergeJob;

type CreateInput = Readonly<{
  id: string;
  ownerId: UserId;
  sourceTagId: TagId;
  targetTagId: TagId;
}>;

// Loose-typed because adapters feed untrusted persistence rows; each
// field is re-validated inside `reconstruct`.
type ReconstructInput = Readonly<{
  id: string;
  ownerId: string;
  sourceTagId: string;
  targetTagId: string;
  status: string;
  progress: { processed: number; total: number };
  affectedNoteIds: readonly string[];
  errorCode: string | null;
  errorReason: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}>;

function illegalTransition(from: TagMergeStatus, to: TagMergeStatus): never {
  throw new BusinessRuleError(
    TagMergeJobErrorCode.IllegalTransition,
    `Illegal TagMergeJob transition: ${from} -> ${to}`,
  );
}

/**
 * Pending → processing. The `total` is the snapshot count of notes that
 * still carry the source tag, captured before any mutation so the bar
 * denominator is fixed. This is a **pending-only** transition; a
 * crash-resumed `processing` job re-uses its persisted `total` via
 * `recordProgress` instead (ADR-006 S-002).
 */
function startProcessing(
  job: PendingTagMergeJob,
  total: number,
  now: Date,
): ProcessingTagMergeJob {
  const progress = TagMergeProgress.create(0, total);
  return {
    ...job,
    status: "processing",
    progress,
    version: Version.next(job.version),
    updatedAt: now,
  };
}

/**
 * Advances `processed` while keeping the existing `total`. Callable on a
 * re-entered `processing` job (crash resume) so the persisted denominator
 * is never re-seeded. A regressing `processed` (below the current value)
 * is rejected so the bar can only move forward — this forward-only
 * invariant is enforced in the domain rather than left to runner
 * discipline (ADR-006 S-002).
 */
function recordProgress(
  job: ProcessingTagMergeJob,
  processed: number,
  now: Date,
): ProcessingTagMergeJob {
  if (processed < job.progress.processed) {
    throw new BusinessRuleError(
      TagMergeJobErrorCode.InvalidProgress,
      `processed (${processed}) cannot regress below current progress (${job.progress.processed})`,
    );
  }
  const progress = TagMergeProgress.create(processed, job.progress.total);
  return {
    ...job,
    progress,
    version: Version.next(job.version),
    updatedAt: now,
  };
}

function complete(
  job: ProcessingTagMergeJob,
  affectedNoteIds: readonly NoteId[],
  now: Date,
): CompletedTagMergeJob {
  return {
    ...job,
    status: "completed",
    affectedNoteIds: [...affectedNoteIds],
    completedAt: now,
    version: Version.next(job.version),
    updatedAt: now,
  };
}

function fail(
  job: PendingTagMergeJob | ProcessingTagMergeJob,
  code: string,
  reason: string,
  now: Date,
): FailedTagMergeJob {
  const normalizedCode = validateErrorCode(code);
  const normalizedReason = validateErrorReason(reason);
  return {
    ...job,
    status: "failed",
    affectedNoteIds: null,
    errorCode: normalizedCode,
    errorReason: normalizedReason,
    completedAt: now,
    version: Version.next(job.version),
    updatedAt: now,
  };
}

function assertOwnedBy(job: TagMergeJob, userId: UserId): void {
  if (job.ownerId !== userId) {
    throw new BusinessRuleError(
      TagMergeJobErrorCode.Unauthorized,
      `TagMergeJob ${job.id} is not owned by ${userId}`,
    );
  }
}

function reconstructByStatus(
  base: TagMergeJobBase,
  status: TagMergeStatus,
  args: {
    affectedNoteIds: readonly NoteId[];
    errorCode: string | null;
    errorReason: string | null;
    completedAt: Date | null;
  },
): TagMergeJob {
  switch (status) {
    case "pending":
    case "processing": {
      if (
        args.errorCode !== null ||
        args.errorReason !== null ||
        args.completedAt !== null
      ) {
        throw new BusinessRuleError(
          TagMergeJobErrorCode.InvalidStatus,
          `${status} tag merge job must not carry error / completion fields`,
        );
      }
      return {
        ...base,
        status,
        affectedNoteIds: null,
        errorCode: null,
        errorReason: null,
        completedAt: null,
      } satisfies PendingTagMergeJob | ProcessingTagMergeJob;
    }
    case "completed": {
      if (args.completedAt === null) {
        throw new BusinessRuleError(
          TagMergeJobErrorCode.InvalidStatus,
          "Completed tag merge job must carry completedAt",
        );
      }
      if (args.errorCode !== null || args.errorReason !== null) {
        throw new BusinessRuleError(
          TagMergeJobErrorCode.InvalidStatus,
          "Completed tag merge job must not carry error fields",
        );
      }
      return {
        ...base,
        status,
        affectedNoteIds: [...args.affectedNoteIds],
        errorCode: null,
        errorReason: null,
        completedAt: args.completedAt,
      } satisfies CompletedTagMergeJob;
    }
    case "failed": {
      if (args.errorCode === null || args.errorReason === null) {
        throw new BusinessRuleError(
          TagMergeJobErrorCode.InvalidStatus,
          "Failed tag merge job must carry errorCode and errorReason",
        );
      }
      if (args.completedAt === null) {
        throw new BusinessRuleError(
          TagMergeJobErrorCode.InvalidStatus,
          "Failed tag merge job must carry completedAt",
        );
      }
      return {
        ...base,
        status,
        affectedNoteIds: null,
        errorCode: validateErrorCode(args.errorCode),
        errorReason: validateErrorReason(args.errorReason),
        completedAt: args.completedAt,
      } satisfies FailedTagMergeJob;
    }
  }
}

export const TagMergeJob = {
  isPending: (job: TagMergeJob): job is PendingTagMergeJob =>
    job.status === "pending",
  isProcessing: (job: TagMergeJob): job is ProcessingTagMergeJob =>
    job.status === "processing",
  isCompleted: (job: TagMergeJob): job is CompletedTagMergeJob =>
    job.status === "completed",
  isFailed: (job: TagMergeJob): job is FailedTagMergeJob =>
    job.status === "failed",

  create: (
    params: CreateInput,
    now: Date,
  ): WithEventDrafts<PendingTagMergeJob, TagMergeJobEvent> => {
    const job: PendingTagMergeJob = {
      id: TagMergeJobId.create(params.id),
      ownerId: params.ownerId,
      sourceTagId: params.sourceTagId,
      targetTagId: params.targetTagId,
      progress: TagMergeProgress.initial(),
      status: "pending",
      affectedNoteIds: null,
      errorCode: null,
      errorReason: null,
      version: Version.initial(),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    return {
      entity: job,
      eventDrafts: [TagMergeEvents.requested(job.id, now)],
    };
  },

  // Distinguished from `BusinessRuleError` so adapters can map
  // storage-row-cannot-be-rehydrated to `SystemError(DataIntegrityError)`
  // while fresh-input validation remains a 4xx user-visible failure.
  reconstruct: (input: ReconstructInput): TagMergeJob => {
    try {
      const status = TagMergeStatusVO.create(input.status);
      const base: TagMergeJobBase = {
        id: TagMergeJobId.create(input.id),
        // ownerId / tagId values are opaque to this domain; trust the
        // adapter's brand and let storage adapters re-validate via the
        // matching factories on their side.
        ownerId: input.ownerId as UserId,
        sourceTagId: input.sourceTagId as TagId,
        targetTagId: input.targetTagId as TagId,
        progress: TagMergeProgress.create(
          input.progress.processed,
          input.progress.total,
        ),
        version: Version.create(input.version),
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      };
      return reconstructByStatus(base, status, {
        affectedNoteIds: input.affectedNoteIds.map((id) => id as NoteId),
        errorCode: input.errorCode,
        errorReason: input.errorReason,
        completedAt: input.completedAt,
      });
    } catch (error) {
      throw new RehydrationError(
        `Failed to rehydrate TagMergeJob (id=${input.id})`,
        error,
      );
    }
  },

  startProcessing,
  recordProgress,
  complete,
  fail,
  assertOwnedBy,
  illegalTransition,
};
