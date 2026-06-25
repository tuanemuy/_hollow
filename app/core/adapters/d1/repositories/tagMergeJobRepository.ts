import { and, eq } from "drizzle-orm";
import {
  ConflictError,
  SystemError,
  SystemErrorCode,
} from "@/core/application/errors";
import type { IdGenerator } from "@/core/application/ports/idGenerator";
import type {
  ExpectedVersion,
  Versioned,
} from "@/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@/core/domain/error";
import { TagMergeJob } from "@/core/domain/tag/mergeJob/entity";
import type { TagMergeJobRepository } from "@/core/domain/tag/ports/tagMergeJobRepository";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { tagMergeJobs } from "../schema";
import { mapDbError } from "./helpers";

type TagMergeJobRow = typeof tagMergeJobs.$inferSelect;

// Persisted shape is opaque to the caller — we re-parse defensively and let
// `TagMergeJob.reconstruct` re-validate the field-level invariants. Any
// structural mismatch surfaces as `SystemError(DataIntegrityError)` via the
// `RehydrationError` translation below.
function parseStringArray(raw: string, label: string): readonly string[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Stored tag_merge_job has malformed ${label}: expected JSON array`,
    );
  }
  for (const entry of parsed) {
    if (typeof entry !== "string") {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored tag_merge_job has malformed ${label}: expected string entries`,
      );
    }
  }
  return parsed as readonly string[];
}

/**
 * D1 implementation of `TagMergeJobRepository`. Mirrors
 * `D1ExportJobRepository` — reads run immediately against the binding,
 * writes register Drizzle query expressions on the supplied
 * `PendingBatch` so the surrounding `D1UnitOfWorkProvider` can flush them
 * atomically via `db.batch()`.
 *
 * `affected_note_ids_json` round-trips through JSON because the persisted
 * shape is structural and the entity factory re-validates the field-level
 * invariants on rehydration. OCC is enforced by the
 * `ExpectedVersion<TagMergeJob>` token returned from `findById`.
 */
export class D1TagMergeJobRepository implements TagMergeJobRepository {
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
    private readonly idGenerator: IdGenerator,
  ) {}

  private toEntity(row: TagMergeJobRow): TagMergeJob {
    if (!this.idGenerator.validate(row.id)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored tag_merge_job has malformed id: ${row.id}`,
      );
    }
    try {
      return TagMergeJob.reconstruct({
        id: row.id,
        ownerId: row.ownerId,
        sourceTagId: row.sourceTagId,
        targetTagId: row.targetTagId,
        status: row.status,
        progress: {
          processed: row.progressProcessed,
          total: row.progressTotal,
        },
        affectedNoteIds: parseStringArray(
          row.affectedNoteIdsJson,
          "affected_note_ids_json",
        ),
        errorCode: row.errorCode,
        errorReason: row.errorReason,
        version: row.version,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        completedAt: row.completedAt ? new Date(row.completedAt) : null,
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored tag_merge_job violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private toVersioned(row: TagMergeJobRow): Versioned<TagMergeJob> {
    return {
      entity: this.toEntity(row),
      expectedVersion: row.version as ExpectedVersion<TagMergeJob>,
    };
  }

  private toRowValues(job: TagMergeJob) {
    return {
      id: job.id,
      ownerId: job.ownerId,
      sourceTagId: job.sourceTagId,
      targetTagId: job.targetTagId,
      status: job.status,
      progressProcessed: job.progress.processed,
      progressTotal: job.progress.total,
      affectedNoteIdsJson: JSON.stringify(job.affectedNoteIds ?? []),
      errorCode: job.errorCode,
      errorReason: job.errorReason,
      version: job.version,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    };
  }

  findById(id: string): Promise<Versioned<TagMergeJob> | null> {
    return mapDbError("Failed to find tag_merge_job", async () => {
      const rows = await this.db
        .select()
        .from(tagMergeJobs)
        .where(eq(tagMergeJobs.id, id))
        .limit(1);
      const row = rows[0];
      return row ? this.toVersioned(row) : null;
    });
  }

  async insert(job: TagMergeJob): Promise<void> {
    this.pending.add(
      this.db.insert(tagMergeJobs).values(this.toRowValues(job)),
    );
  }

  async save(
    job: TagMergeJob,
    expectedVersion: ExpectedVersion<TagMergeJob>,
  ): Promise<void> {
    const jobId = job.id;
    const values = this.toRowValues(job);
    this.pending.addOcc(
      this.db
        .update(tagMergeJobs)
        .set(values)
        .where(
          and(
            eq(tagMergeJobs.id, job.id),
            eq(tagMergeJobs.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while saving tag_merge_job ${jobId}: expected version ${expectedVersion}`,
        );
      },
    );
  }

  async delete(
    id: string,
    expectedVersion: ExpectedVersion<TagMergeJob>,
  ): Promise<void> {
    this.pending.addOcc(
      this.db
        .delete(tagMergeJobs)
        .where(
          and(
            eq(tagMergeJobs.id, id),
            eq(tagMergeJobs.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while deleting tag_merge_job ${id}: expected version ${expectedVersion}`,
        );
      },
    );
  }
}
