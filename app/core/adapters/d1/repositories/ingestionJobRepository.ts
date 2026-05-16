import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
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
import { DirectoryId } from "@/core/domain/directory/valueObject";
import { isRehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { IngestionJob } from "@/core/domain/ingestion/entity";
import type {
  IngestionJobListOpts,
  IngestionJobRepository,
} from "@/core/domain/ingestion/ports/ingestionJobRepository";
import {
  type IngestionJobId,
  IngestionPreview,
  type IngestionStatus,
} from "@/core/domain/ingestion/valueObject";
import { MediaAssetId } from "@/core/domain/media/valueObject";
import {
  ContentHtml,
  FrontMatter,
  InternalLinkRef,
  NoteId,
  NoteTitle,
} from "@/core/domain/note/valueObject";
import { TagName } from "@/core/domain/tag/valueObject";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { ingestionJobs } from "../schema";
import { mapDbError } from "./helpers";

type IngestionJobRow = typeof ingestionJobs.$inferSelect;

/**
 * Wire shape persisted in `ingestion_jobs.preview_json`.
 *
 * Stored as a plain structure so the in-memory `IngestionPreview` brand
 * is reconstructed via its public factory on rehydration. Adapters are
 * the only legitimate construction site for branded VOs reanimated from
 * untrusted persistence data — every branded sub-VO is rebuilt through
 * its own `create` factory below.
 */
type SerializedPreview = Readonly<{
  title: string;
  contentHtml: string;
  suggestedDirectoryId: string | null;
  suggestedDirectoryName: string | null;
  frontMatter: Record<string, unknown>;
  suggestedTagNames: readonly string[];
  internalLinkRefs: readonly Readonly<{
    kind: "id" | "title";
    target: string;
    resolvedNoteId: string | null;
    displayText: string | null;
  }>[];
  mediaRefs: readonly string[];
}>;

function serializePreview(preview: IngestionPreview): SerializedPreview {
  return {
    title: preview.title as string,
    contentHtml: preview.contentHtml as string,
    suggestedDirectoryId:
      preview.suggestedDirectoryId === null
        ? null
        : (preview.suggestedDirectoryId as string),
    suggestedDirectoryName: preview.suggestedDirectoryName,
    // `FrontMatter` is structurally a `Record<string, FrontMatterValue>`
    // under the brand; spread is enough to drop the brand before
    // `JSON.stringify` and survive the round-trip.
    frontMatter: { ...preview.frontMatter },
    suggestedTagNames: preview.suggestedTagNames.map((t) => t as string),
    internalLinkRefs: preview.internalLinkRefs.map((ref) => ({
      kind: ref.kind,
      target: ref.target,
      resolvedNoteId:
        ref.resolvedNoteId === null ? null : (ref.resolvedNoteId as string),
      displayText: ref.displayText,
    })),
    mediaRefs: preview.mediaRefs.map((m) => m as string),
  };
}

function deserializePreview(raw: unknown): IngestionPreview {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      "Stored ingestion preview is not a JSON object",
    );
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.title !== "string" || typeof obj.contentHtml !== "string") {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      "Stored ingestion preview missing required title / contentHtml",
    );
  }
  const internalLinkRefsRaw = Array.isArray(obj.internalLinkRefs)
    ? obj.internalLinkRefs
    : [];
  const internalLinkRefs = internalLinkRefsRaw.map((entry) => {
    if (entry === null || typeof entry !== "object") {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Stored ingestion preview contains malformed internal link entry",
      );
    }
    const e = entry as Record<string, unknown>;
    if (e.kind !== "id" && e.kind !== "title") {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored ingestion preview internal link has invalid kind: ${String(e.kind)}`,
      );
    }
    if (typeof e.target !== "string") {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Stored ingestion preview internal link missing target",
      );
    }
    const resolvedRaw = e.resolvedNoteId;
    const displayRaw = e.displayText;
    return InternalLinkRef.create({
      kind: e.kind,
      target: e.target,
      resolvedNoteId:
        resolvedRaw === null || resolvedRaw === undefined
          ? null
          : typeof resolvedRaw === "string"
            ? NoteId.create(resolvedRaw)
            : (() => {
                throw new SystemError(
                  SystemErrorCode.DataIntegrityError,
                  "Stored ingestion preview internal link resolvedNoteId is not a string",
                );
              })(),
      displayText:
        displayRaw === null || displayRaw === undefined
          ? null
          : typeof displayRaw === "string"
            ? displayRaw
            : (() => {
                throw new SystemError(
                  SystemErrorCode.DataIntegrityError,
                  "Stored ingestion preview internal link displayText is not a string",
                );
              })(),
    });
  });
  const tagNamesRaw = Array.isArray(obj.suggestedTagNames)
    ? obj.suggestedTagNames
    : [];
  const tagNames = tagNamesRaw.map((entry) => {
    if (typeof entry !== "string") {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Stored ingestion preview suggested tag is not a string",
      );
    }
    return TagName.create(entry);
  });
  const mediaRefsRaw = Array.isArray(obj.mediaRefs) ? obj.mediaRefs : [];
  const mediaRefs = mediaRefsRaw.map((entry) => {
    if (typeof entry !== "string") {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        "Stored ingestion preview media ref is not a string",
      );
    }
    return MediaAssetId.create(entry);
  });
  const frontMatterRaw =
    obj.frontMatter && typeof obj.frontMatter === "object"
      ? (obj.frontMatter as Record<string, unknown>)
      : {};
  const suggestedDirectoryIdRaw = obj.suggestedDirectoryId;
  const suggestedDirectoryNameRaw = obj.suggestedDirectoryName;
  return IngestionPreview.create({
    title: NoteTitle.create(obj.title),
    contentHtml: ContentHtml.create(obj.contentHtml),
    suggestedDirectoryId:
      suggestedDirectoryIdRaw === null || suggestedDirectoryIdRaw === undefined
        ? null
        : typeof suggestedDirectoryIdRaw === "string"
          ? DirectoryId.create(suggestedDirectoryIdRaw)
          : (() => {
              throw new SystemError(
                SystemErrorCode.DataIntegrityError,
                "Stored ingestion preview suggestedDirectoryId is not a string",
              );
            })(),
    suggestedDirectoryName:
      suggestedDirectoryNameRaw === null ||
      suggestedDirectoryNameRaw === undefined
        ? null
        : typeof suggestedDirectoryNameRaw === "string"
          ? suggestedDirectoryNameRaw
          : (() => {
              throw new SystemError(
                SystemErrorCode.DataIntegrityError,
                "Stored ingestion preview suggestedDirectoryName is not a string",
              );
            })(),
    // `FrontMatter.create` re-validates the structure (keys / depth /
    // value types) and re-applies the brand, so the raw object from
    // storage cannot leak into the domain without invariant checks.
    frontMatter: FrontMatter.create(
      frontMatterRaw as Parameters<typeof FrontMatter.create>[0],
    ),
    suggestedTagNames: tagNames,
    internalLinkRefs,
    mediaRefs,
  });
}

/**
 * D1 implementation of `IngestionJobRepository`. Reads execute
 * immediately against the binding; writes register Drizzle query
 * expressions on the supplied `PendingBatch` so the surrounding
 * `D1UnitOfWorkProvider` can flush them atomically via `db.batch()`.
 *
 * OCC is enforced by the `ExpectedVersion<IngestionJob>` token returned
 * from `findById` — the file is the only legitimate construction site
 * for the token (via the `as` cast inside `toVersioned`). The
 * `ingestion_jobs.preview_json` column carries the `IngestionPreview`
 * value object as a JSON-serialised structure; the branded VOs inside
 * are reconstructed through their canonical factories during
 * rehydration so storage drift cannot bypass invariants.
 */
export class D1IngestionJobRepository implements IngestionJobRepository {
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
    private readonly idGenerator: IdGenerator,
  ) {}

  private toEntity(row: IngestionJobRow): IngestionJob {
    if (!this.idGenerator.validate(row.id)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored ingestion_job has malformed id: ${row.id}`,
      );
    }
    let preview: IngestionPreview | null = null;
    if (row.previewJson !== null && row.previewJson.length > 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(row.previewJson);
      } catch (cause) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          `Stored ingestion_job preview_json is not valid JSON (id=${row.id})`,
          cause,
        );
      }
      preview = deserializePreview(parsed);
    }
    try {
      return IngestionJob.reconstruct({
        id: row.id,
        ownerId: row.ownerId,
        originalFileName: row.originalFileName,
        mimeType: row.mimeType,
        byteSize: row.byteSize,
        kind: row.kind,
        status: row.status,
        tempStorageKey: row.tempStorageKey,
        preview,
        errorCode: row.errorCode,
        errorReason: row.errorReason,
        regenerationCount: row.regenerationCount,
        savedAsNoteId:
          row.savedAsNoteId === null ? null : NoteId.create(row.savedAsNoteId),
        version: row.version,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored ingestion_job violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private toVersioned(row: IngestionJobRow): Versioned<IngestionJob> {
    return {
      entity: this.toEntity(row),
      expectedVersion: row.version as ExpectedVersion<IngestionJob>,
    };
  }

  private toRowValues(job: IngestionJob): {
    id: string;
    ownerId: string;
    originalFileName: string;
    mimeType: string;
    byteSize: number;
    kind: string;
    status: IngestionStatus;
    tempStorageKey: string | null;
    previewJson: string | null;
    errorCode: string | null;
    errorReason: string | null;
    regenerationCount: number;
    savedAsNoteId: string | null;
    version: number;
    createdAt: string;
    updatedAt: string;
  } {
    return {
      id: job.id,
      ownerId: job.ownerId,
      originalFileName: job.originalFileName,
      mimeType: job.mimeType,
      byteSize: job.byteSize,
      kind: job.kind,
      status: job.status,
      tempStorageKey:
        job.tempStorageKey === null ? null : (job.tempStorageKey as string),
      previewJson:
        job.preview === null
          ? null
          : JSON.stringify(serializePreview(job.preview)),
      errorCode: job.errorCode,
      errorReason: job.errorReason,
      regenerationCount: job.regenerationCount,
      savedAsNoteId:
        job.savedAsNoteId === null ? null : (job.savedAsNoteId as string),
      version: job.version,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };
  }

  findById(id: IngestionJobId): Promise<Versioned<IngestionJob> | null> {
    return mapDbError("Failed to find ingestion_job", async () => {
      const rows = await this.db
        .select()
        .from(ingestionJobs)
        .where(eq(ingestionJobs.id, id))
        .limit(1);
      const row = rows[0];
      return row ? this.toVersioned(row) : null;
    });
  }

  findByOwner(
    ownerId: UserId,
    opts: IngestionJobListOpts,
  ): Promise<readonly IngestionJob[]> {
    return mapDbError("Failed to list ingestion_jobs by owner", async () => {
      const order = opts.order ?? "desc";
      const conditions = [eq(ingestionJobs.ownerId, ownerId)];
      if (opts.status !== undefined) {
        conditions.push(eq(ingestionJobs.status, opts.status));
      }
      const rows = await this.db
        .select()
        .from(ingestionJobs)
        .where(and(...conditions))
        .orderBy(
          order === "asc"
            ? asc(ingestionJobs.updatedAt)
            : desc(ingestionJobs.updatedAt),
          order === "asc" ? asc(ingestionJobs.id) : desc(ingestionJobs.id),
        )
        .limit(opts.limit)
        .offset(opts.offset);
      return rows.map((r) => this.toEntity(r));
    });
  }

  sumByteSizeByOwnerSince(ownerId: UserId, since: Date): Promise<number> {
    return mapDbError(
      "Failed to aggregate ingestion_job byte sizes",
      async () => {
        const iso = since.toISOString();
        const rows = await this.db
          .select({
            total: sql<number>`COALESCE(SUM(${ingestionJobs.byteSize}), 0)`,
          })
          .from(ingestionJobs)
          .where(
            and(
              eq(ingestionJobs.ownerId, ownerId),
              gte(ingestionJobs.createdAt, iso),
            ),
          );
        const row = rows[0];
        if (row === undefined) return 0;
        const raw = row.total as unknown;
        if (typeof raw === "number") return raw;
        if (typeof raw === "string") {
          const parsed = Number(raw);
          return Number.isFinite(parsed) ? parsed : 0;
        }
        return 0;
      },
    );
  }

  findStuck(threshold: Date): Promise<readonly IngestionJob[]> {
    return mapDbError("Failed to list stuck ingestion_jobs", async () => {
      const iso = threshold.toISOString();
      const rows = await this.db
        .select()
        .from(ingestionJobs)
        .where(
          and(
            eq(ingestionJobs.status, "processing"),
            lt(ingestionJobs.updatedAt, iso),
          ),
        )
        .orderBy(asc(ingestionJobs.updatedAt), asc(ingestionJobs.id));
      return rows.map((r) => this.toEntity(r));
    });
  }

  async insert(job: IngestionJob): Promise<void> {
    const row = this.toRowValues(job);
    this.pending.add(this.db.insert(ingestionJobs).values(row));
  }

  async save(
    job: IngestionJob,
    expectedVersion: ExpectedVersion<IngestionJob>,
  ): Promise<void> {
    const jobId = job.id;
    const row = this.toRowValues(job);
    this.pending.addOcc(
      this.db
        .update(ingestionJobs)
        .set({
          // Owner / original metadata are immutable post-insert; only
          // the mutable lifecycle columns are written on update so that
          // a stale aggregate cannot rewrite immutable provenance.
          status: row.status,
          tempStorageKey: row.tempStorageKey,
          previewJson: row.previewJson,
          errorCode: row.errorCode,
          errorReason: row.errorReason,
          regenerationCount: row.regenerationCount,
          savedAsNoteId: row.savedAsNoteId,
          version: row.version,
          updatedAt: row.updatedAt,
        })
        .where(
          and(
            eq(ingestionJobs.id, jobId),
            eq(ingestionJobs.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while saving ingestion_job ${jobId}: expected version ${expectedVersion}`,
        );
      },
    );
  }

  async delete(
    id: IngestionJobId,
    expectedVersion: ExpectedVersion<IngestionJob>,
  ): Promise<void> {
    this.pending.addOcc(
      this.db
        .delete(ingestionJobs)
        .where(
          and(
            eq(ingestionJobs.id, id),
            eq(ingestionJobs.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while deleting ingestion_job ${id}: expected version ${expectedVersion}`,
        );
      },
    );
  }
}
