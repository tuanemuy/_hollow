import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import { SystemError, SystemErrorCode } from "@/core/application/errors";
import type { IdGenerator } from "@/core/application/ports/idGenerator";
import { isRehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { MediaAsset } from "@/core/domain/media/entity";
import type {
  MediaAssetRepository,
  MediaListOpts,
} from "@/core/domain/media/ports/mediaAssetRepository";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { mediaAssets } from "../schema";
import { selectInChunks } from "./_chunks";
import { mapDbError } from "./helpers";

type MediaAssetRow = typeof mediaAssets.$inferSelect;

/**
 * D1 implementation of `MediaAssetRepository`.
 *
 * Unlike `D1NoteRepository`, this aggregate does not extend
 * `TransactionalRepository`: ref-count mutations are too high-frequency
 * to thread `ExpectedVersion` tokens without deadlock. `save` is
 * upsert-style and relies on SQLite's per-statement atomicity for
 * concurrent ref-count writers (`ON CONFLICT(id) DO UPDATE SET ...`).
 *
 * Writes are still buffered through the surrounding UoW's
 * `PendingBatch` so the aggregate write lands in the same `db.batch()`
 * as any outbox events produced by the same usecase. Reads execute
 * immediately against the binding.
 *
 * Timestamps round-trip through ISO 8601 because `media_assets`'
 * `created_at` / `updated_at` columns are `TEXT`.
 */
export class D1MediaAssetRepository implements MediaAssetRepository {
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
    private readonly idGenerator: IdGenerator,
  ) {}

  private toMediaAsset(row: MediaAssetRow): MediaAsset {
    if (!this.idGenerator.validate(row.id)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored media asset has malformed id: ${row.id}`,
      );
    }
    try {
      return MediaAsset.reconstruct({
        id: row.id,
        ownerId: row.ownerId,
        kind: row.kind,
        mimeType: row.mimeType,
        byteSize: row.byteSize,
        backend: row.backend,
        storageKey: row.storageKey,
        originalFileName: row.originalFileName,
        width: row.width,
        height: row.height,
        durationMs: row.durationMs,
        refCount: row.refCount,
        status: row.status,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored media asset violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  findById(id: MediaAssetId): Promise<MediaAsset | null> {
    return mapDbError("Failed to find media asset", async () => {
      const rows = await this.db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, id))
        .limit(1);
      const row = rows[0];
      return row ? this.toMediaAsset(row) : null;
    });
  }

  findByIds(ids: readonly MediaAssetId[]): Promise<readonly MediaAsset[]> {
    return mapDbError("Failed to find media assets by ids", async () => {
      if (ids.length === 0) return [];
      const rows = await selectInChunks(ids, (chunk) =>
        this.db
          .select()
          .from(mediaAssets)
          .where(inArray(mediaAssets.id, [...chunk])),
      );
      return rows.map((row) => this.toMediaAsset(row));
    });
  }

  // Paged by `(createdAt DESC, id DESC)` — UUIDv7 ids are
  // monotonically time-ordered, so the `id < cursor` keyset filter is a
  // good proxy for "strictly older than the last row of the previous
  // page" without needing a composite cursor on the port surface.
  findByOwner(
    ownerId: UserId,
    opts: MediaListOpts,
  ): Promise<readonly MediaAsset[]> {
    return mapDbError("Failed to list media assets by owner", async () => {
      const whereClauses = opts.cursor
        ? and(eq(mediaAssets.ownerId, ownerId), lt(mediaAssets.id, opts.cursor))
        : eq(mediaAssets.ownerId, ownerId);
      const rows = await this.db
        .select()
        .from(mediaAssets)
        .where(whereClauses)
        .orderBy(desc(mediaAssets.createdAt), desc(mediaAssets.id))
        .limit(opts.limit);
      return rows.map((row) => this.toMediaAsset(row));
    });
  }

  findPurgeableOlderThan(
    before: Date,
    limit: number,
  ): Promise<readonly MediaAsset[]> {
    return mapDbError("Failed to find purgeable media assets", async () => {
      const cutoff = before.toISOString();
      const rows = await this.db
        .select()
        .from(mediaAssets)
        .where(
          and(
            inArray(mediaAssets.status, ["orphan", "deleting"]),
            lt(mediaAssets.updatedAt, cutoff),
          ),
        )
        .orderBy(asc(mediaAssets.updatedAt), asc(mediaAssets.id))
        .limit(limit);
      return rows.map((row) => this.toMediaAsset(row));
    });
  }

  // Upsert because the port collapses insert / update into a single
  // `save` operation (no OCC token to discriminate them). `ON CONFLICT
  // DO UPDATE` is safe here precisely *because* there is no version to
  // protect — ref-count mutations explicitly opt out of optimistic
  // concurrency in favour of atomic SQL semantics.
  async save(asset: MediaAsset): Promise<void> {
    const values = {
      id: asset.id as string,
      ownerId: asset.ownerId as string,
      kind: asset.kind,
      mimeType: asset.mimeType as string,
      byteSize: asset.byteSize,
      backend: asset.backend,
      storageKey: asset.storageKey as string,
      originalFileName: asset.originalFileName as string | null,
      width: asset.width,
      height: asset.height,
      durationMs: asset.durationMs,
      refCount: asset.refCount,
      status: asset.status,
      createdAt: asset.createdAt.toISOString(),
      updatedAt: asset.updatedAt.toISOString(),
    };
    this.pending.add(
      this.db
        .insert(mediaAssets)
        .values(values)
        .onConflictDoUpdate({
          target: mediaAssets.id,
          set: {
            ownerId: values.ownerId,
            kind: values.kind,
            mimeType: values.mimeType,
            byteSize: values.byteSize,
            backend: values.backend,
            storageKey: values.storageKey,
            originalFileName: values.originalFileName,
            width: values.width,
            height: values.height,
            durationMs: values.durationMs,
            refCount: values.refCount,
            status: values.status,
            updatedAt: values.updatedAt,
          },
        }),
    );
  }

  async delete(id: MediaAssetId): Promise<void> {
    this.pending.add(
      this.db.delete(mediaAssets).where(eq(mediaAssets.id, id as string)),
    );
  }
}
