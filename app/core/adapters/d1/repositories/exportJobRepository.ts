import { and, asc, desc, eq, isNotNull, lt } from "drizzle-orm";
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
import { ExportJob } from "@/core/domain/export/entity";
import type {
  ExportJobListOpts,
  ExportJobRepository,
} from "@/core/domain/export/ports/exportJobRepository";
import type {
  ExportOptions,
  ViewQuerySnapshot,
} from "@/core/domain/export/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { exportJobs } from "../schema";
import { mapDbError } from "./helpers";

type ExportJobRow = typeof exportJobs.$inferSelect;

type SerializedDateRange = Readonly<{
  from: string | null;
  to: string | null;
}>;

type SerializedViewQuery = Readonly<{
  directoryId: string | null;
  tagIds: readonly string[];
  dateRange: SerializedDateRange | null;
  keyword: string | null;
  referencingNoteId: string | null;
}>;

type SerializedOptions = Readonly<{
  includeFrontMatter: boolean;
  embedMedia: boolean;
  pdfPaperSize: string | null;
}>;

function serializeViewQuery(snapshot: ViewQuerySnapshot | null): string | null {
  if (snapshot === null) return null;
  const payload: SerializedViewQuery = {
    directoryId: snapshot.directoryId,
    tagIds: snapshot.tagIds,
    dateRange:
      snapshot.dateRange === null
        ? null
        : {
            from:
              snapshot.dateRange.from === null
                ? null
                : snapshot.dateRange.from.toISOString(),
            to:
              snapshot.dateRange.to === null
                ? null
                : snapshot.dateRange.to.toISOString(),
          },
    keyword: snapshot.keyword,
    referencingNoteId: snapshot.referencingNoteId,
  };
  return JSON.stringify(payload);
}

function serializeOptions(options: ExportOptions): string {
  const payload: SerializedOptions = {
    includeFrontMatter: options.includeFrontMatter,
    embedMedia: options.embedMedia,
    pdfPaperSize: options.pdfPaperSize,
  };
  return JSON.stringify(payload);
}

// Persisted shape is opaque to the caller — we re-parse defensively and let
// `ExportJob.reconstruct` re-validate the field-level invariants. Any
// structural mismatch surfaces as `SystemError(DataIntegrityError)` via the
// `RehydrationError` translation below.
function parseStringArray(raw: string, label: string): readonly string[] {
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Stored export_job has malformed ${label}: expected JSON array`,
    );
  }
  for (const entry of parsed) {
    if (typeof entry !== "string") {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored export_job has malformed ${label}: expected string entries`,
      );
    }
  }
  return parsed as readonly string[];
}

function parseViewQuery(raw: string | null): ViewQuerySnapshot | null {
  if (raw === null) return null;
  const parsed = JSON.parse(raw) as SerializedViewQuery;
  return {
    directoryId: parsed.directoryId as ViewQuerySnapshot["directoryId"],
    tagIds: parsed.tagIds.map(
      (id) => id as ViewQuerySnapshot["tagIds"][number],
    ),
    dateRange:
      parsed.dateRange === null
        ? null
        : {
            from:
              parsed.dateRange.from === null
                ? null
                : new Date(parsed.dateRange.from),
            to:
              parsed.dateRange.to === null
                ? null
                : new Date(parsed.dateRange.to),
          },
    keyword: parsed.keyword,
    referencingNoteId:
      parsed.referencingNoteId as ViewQuerySnapshot["referencingNoteId"],
  };
}

function parseOptions(raw: string): ExportOptions {
  const parsed = JSON.parse(raw) as SerializedOptions;
  return {
    includeFrontMatter: parsed.includeFrontMatter,
    embedMedia: parsed.embedMedia,
    pdfPaperSize: parsed.pdfPaperSize as ExportOptions["pdfPaperSize"],
  };
}

/**
 * D1 implementation of `ExportJobRepository`. Mirrors `D1TodoRepository`
 * — reads run immediately against the binding, writes register Drizzle
 * query expressions on the supplied `PendingBatch` so the surrounding
 * `D1UnitOfWorkProvider` can flush them atomically via `db.batch()`.
 *
 * `view_query_json` / `options_json` / `target_note_ids_json` /
 * `failed_note_ids_json` round-trip through JSON because the persisted
 * shape is structural and the entity factory re-validates the field-level
 * invariants on rehydration. Any structural mismatch surfaces as
 * `SystemError(DataIntegrityError)` via the `RehydrationError` branch
 * below.
 *
 * OCC is enforced by the `ExpectedVersion<ExportJob>` token returned
 * from `findById`. This file is the only legitimate construction site
 * of the token (via the `as` cast inside `toVersioned`) — the brand
 * keeps raw numbers out at every other call site.
 */
export class D1ExportJobRepository implements ExportJobRepository {
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
    private readonly idGenerator: IdGenerator,
  ) {}

  private toEntity(row: ExportJobRow): ExportJob {
    if (!this.idGenerator.validate(row.id)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored export_job has malformed id: ${row.id}`,
      );
    }
    try {
      return ExportJob.reconstruct({
        id: row.id,
        ownerId: row.ownerId,
        format: row.format,
        scope: row.scope,
        targetNoteIds: parseStringArray(
          row.targetNoteIdsJson,
          "target_note_ids_json",
        ),
        viewQuery: parseViewQuery(row.viewQueryJson),
        options: parseOptions(row.optionsJson),
        status: row.status,
        artifactKey: row.artifactKey,
        artifactSize: row.artifactSize,
        errorCode: row.errorCode,
        errorReason: row.errorReason,
        progress: {
          processed: row.progressProcessed,
          total: row.progressTotal,
        },
        failedNoteIds: parseStringArray(
          row.failedNoteIdsJson,
          "failed_note_ids_json",
        ),
        version: row.version,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        completedAt: row.completedAt ? new Date(row.completedAt) : null,
        expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored export_job violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private toVersioned(row: ExportJobRow): Versioned<ExportJob> {
    return {
      entity: this.toEntity(row),
      expectedVersion: row.version as ExpectedVersion<ExportJob>,
    };
  }

  private toRowValues(job: ExportJob) {
    return {
      id: job.id,
      ownerId: job.ownerId,
      format: job.format,
      scope: job.scope,
      targetNoteIdsJson: JSON.stringify(job.targetNoteIds),
      viewQueryJson: serializeViewQuery(job.viewQuery),
      optionsJson: serializeOptions(job.options),
      status: job.status,
      artifactKey: job.artifactKey,
      artifactSize: job.artifactSize,
      errorCode: job.errorCode,
      errorReason: job.errorReason,
      progressProcessed: job.progress.processed,
      progressTotal: job.progress.total,
      failedNoteIdsJson: JSON.stringify(job.failedNoteIds),
      version: job.version,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
      expiresAt: job.expiresAt ? job.expiresAt.toISOString() : null,
    };
  }

  findById(id: string): Promise<Versioned<ExportJob> | null> {
    return mapDbError("Failed to find export_job", async () => {
      const rows = await this.db
        .select()
        .from(exportJobs)
        .where(eq(exportJobs.id, id))
        .limit(1);
      const row = rows[0];
      return row ? this.toVersioned(row) : null;
    });
  }

  async insert(job: ExportJob): Promise<void> {
    this.pending.add(this.db.insert(exportJobs).values(this.toRowValues(job)));
  }

  async save(
    job: ExportJob,
    expectedVersion: ExpectedVersion<ExportJob>,
  ): Promise<void> {
    const jobId = job.id;
    const values = this.toRowValues(job);
    this.pending.addOcc(
      this.db
        .update(exportJobs)
        .set(values)
        .where(
          and(
            eq(exportJobs.id, job.id),
            eq(exportJobs.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while saving export_job ${jobId}: expected version ${expectedVersion}`,
        );
      },
    );
  }

  async delete(
    id: string,
    expectedVersion: ExpectedVersion<ExportJob>,
  ): Promise<void> {
    this.pending.addOcc(
      this.db
        .delete(exportJobs)
        .where(
          and(
            eq(exportJobs.id, id),
            eq(exportJobs.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while deleting export_job ${id}: expected version ${expectedVersion}`,
        );
      },
    );
  }

  findByOwner(
    ownerId: UserId,
    opts: ExportJobListOpts,
  ): Promise<readonly ExportJob[]> {
    return mapDbError("Failed to list export_jobs by owner", async () => {
      const order = opts.order ?? "desc";
      const orderBy =
        order === "asc"
          ? [asc(exportJobs.updatedAt), asc(exportJobs.id)]
          : [desc(exportJobs.updatedAt), desc(exportJobs.id)];
      const rows = await this.db
        .select()
        .from(exportJobs)
        .where(eq(exportJobs.ownerId, ownerId))
        .orderBy(...orderBy)
        .limit(opts.limit)
        .offset(opts.offset);
      return rows.map((row) => this.toEntity(row));
    });
  }

  findExpired(now: Date, limit: number): Promise<readonly ExportJob[]> {
    return mapDbError("Failed to list expired export_jobs", async () => {
      const cutoff = now.toISOString();
      const rows = await this.db
        .select()
        .from(exportJobs)
        .where(
          and(
            eq(exportJobs.status, "completed"),
            isNotNull(exportJobs.expiresAt),
            lt(exportJobs.expiresAt, cutoff),
          ),
        )
        .orderBy(asc(exportJobs.expiresAt), asc(exportJobs.id))
        .limit(limit);
      return rows.map((row) => this.toEntity(row));
    });
  }
}
