import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
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
import type { UserId } from "@/core/domain/identity/valueObject";
import { Tag } from "@/core/domain/tag/entity";
import type {
  TagListOpts,
  TagRepository,
} from "@/core/domain/tag/ports/tagRepository";
import type { TagId, TagName } from "@/core/domain/tag/valueObject";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { notes, noteTags, tags } from "../schema";
import { selectInChunks } from "./_chunks";
import { escapeLikePattern, mapDbError } from "./helpers";

type TagRow = typeof tags.$inferSelect;

/**
 * Folds a `TagName` (already NFKC-normalised by the value object) to
 * lower case for the `name_normalized` storage column. The column backs
 * the `uniq_tags_owner_name_normalized` unique index, so two casings of
 * the same name collide at the DB level and surface as a
 * `ConflictError("UNIQUE_VIOLATION")` through `mapDbError`.
 */
function normalizeName(name: TagName): string {
  return (name as string).toLowerCase();
}

/**
 * D1 implementation of `TagRepository`. Reads execute immediately
 * against the binding (no transaction); writes register Drizzle query
 * expressions on the supplied `PendingBatch` so the surrounding
 * `D1UnitOfWorkProvider` can flush them atomically via `db.batch()`.
 *
 * Tag uniqueness is enforced by the `uniq_tags_owner_name_normalized`
 * unique index. A duplicate name surfaces as a
 * `ConflictError("UNIQUE_VIOLATION")` via `mapDbError` — note that
 * deferred-batch writes (`insert` / `save`) only raise this at flush
 * time, i.e. from inside `UnitOfWorkProvider.run`.
 *
 * OCC is enforced by the `ExpectedVersion<Tag>` token returned from
 * `findById`. This file is the only legitimate construction site of
 * the token (via the `as` cast inside `toVersioned`).
 */
export class D1TagRepository implements TagRepository {
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
    private readonly idGenerator: IdGenerator,
  ) {}

  private toTag(row: TagRow): Tag {
    if (!this.idGenerator.validate(row.id)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored tag has malformed id: ${row.id}`,
      );
    }
    try {
      return Tag.reconstruct({
        id: row.id,
        ownerId: row.ownerId,
        name: row.name,
        noteCount: row.noteCount,
        version: row.version,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored tag violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private toVersioned(row: TagRow): Versioned<Tag> {
    return {
      entity: this.toTag(row),
      expectedVersion: row.version as ExpectedVersion<Tag>,
    };
  }

  findById(id: string): Promise<Versioned<Tag> | null> {
    return mapDbError("Failed to find tag", async () => {
      const rows = await this.db
        .select()
        .from(tags)
        .where(eq(tags.id, id))
        .limit(1);
      const row = rows[0];
      return row ? this.toVersioned(row) : null;
    });
  }

  findByOwnerAndName(ownerId: UserId, name: TagName): Promise<Tag | null> {
    return mapDbError("Failed to find tag by owner and name", async () => {
      const rows = await this.db
        .select()
        .from(tags)
        .where(
          and(
            eq(tags.ownerId, ownerId),
            eq(tags.nameNormalized, normalizeName(name)),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row ? this.toTag(row) : null;
    });
  }

  /**
   * Lists an owner's tags with `noteCount` computed at read time by
   * aggregating `note_tags` against active `notes`, rather than reading
   * the denormalised `tags.note_count` cache column (which is left
   * unmaintained — see Issue #365 / `spec/domains/tag.md`). The
   * `tags.note_count` column is intentionally ignored here; the
   * `COUNT(notes.id)` aggregate is the source of truth for display.
   *
   * The aggregate counts only `status = 'active'` notes so the displayed
   * count matches what the FilterBar tag facet returns. `COUNT(notes.id)`
   * (not `COUNT(*)`) is used so the LEFT JOIN's NULL rows for unused /
   * all-trashed tags resolve to 0. The notes join is owner-scoped so the
   * count can never include another owner's note (write paths only link a
   * note to its own owner's tags, but the predicate makes that explicit).
   */
  findByOwner(ownerId: UserId, opts: TagListOpts): Promise<readonly Tag[]> {
    return mapDbError("Failed to list tags by owner", async () => {
      const sortKey = opts.sort ?? "name";
      const order = opts.order ?? "asc";
      const direction = order === "desc" ? desc : asc;

      // Aliased so `orderBy` can reuse it instead of re-emitting the COUNT.
      const noteCountExpr = sql<number>`COUNT(${notes.id})`.as("noteCount");

      const sortExpr =
        sortKey === "noteCount"
          ? noteCountExpr
          : sortKey === "createdAt"
            ? tags.createdAt
            : tags.nameNormalized;

      const trimmedQuery = opts.query?.trim() ?? "";
      const whereExpr =
        trimmedQuery.length > 0
          ? and(
              eq(tags.ownerId, ownerId),
              sql`${tags.nameNormalized} LIKE ${`%${escapeLikePattern(trimmedQuery.toLowerCase())}%`} ESCAPE '\\'`,
            )
          : eq(tags.ownerId, ownerId);

      const rows = await this.db
        .select({
          id: tags.id,
          ownerId: tags.ownerId,
          name: tags.name,
          nameNormalized: tags.nameNormalized,
          noteCount: noteCountExpr,
          version: tags.version,
          createdAt: tags.createdAt,
          updatedAt: tags.updatedAt,
        })
        .from(tags)
        .leftJoin(noteTags, eq(noteTags.tagId, tags.id))
        .leftJoin(
          notes,
          and(
            eq(notes.id, noteTags.noteId),
            eq(notes.ownerId, ownerId),
            eq(notes.status, "active"),
          ),
        )
        .where(whereExpr)
        // Bare-column select alongside `groupBy(tags.id)` relies on
        // SQLite/D1 allowing functional dependence on the GROUP BY key
        // (the PK). Porting to another DB requires grouping by every
        // selected column or re-aggregating.
        .groupBy(tags.id)
        .orderBy(direction(sortExpr), asc(tags.id))
        .limit(opts.limit)
        .offset(opts.offset);
      // D1 may return the COUNT aggregate as a string rather than a
      // number (see `ingestionJobRepository.sumByteSizeByOwnerSince`); a
      // string would fail `Tag.reconstruct`'s `noteCount >= 0` check, so
      // coerce before reconstructing.
      return rows.map((row) =>
        this.toTag({ ...row, noteCount: Number(row.noteCount) }),
      );
    });
  }

  searchByNamePrefix(
    ownerId: UserId,
    prefix: string,
    limit: number,
  ): Promise<readonly Tag[]> {
    return mapDbError("Failed to search tags by name prefix", async () => {
      if (limit <= 0) return [];
      const trimmed = prefix.trim();
      if (trimmed.length === 0) return [];
      const pattern = `${escapeLikePattern(trimmed.toLowerCase())}%`;
      const rows = await this.db
        .select()
        .from(tags)
        .where(
          and(
            eq(tags.ownerId, ownerId),
            sql`${tags.nameNormalized} LIKE ${pattern} ESCAPE '\\'`,
          ),
        )
        .orderBy(asc(tags.nameNormalized), asc(tags.id))
        .limit(limit);
      return rows.map((row) => this.toTag(row));
    });
  }

  findByIds(ids: readonly TagId[]): Promise<readonly Tag[]> {
    return mapDbError("Failed to find tags by ids", async () => {
      if (ids.length === 0) return [];
      const rows = await selectInChunks(ids, (chunk) =>
        this.db
          .select()
          .from(tags)
          .where(inArray(tags.id, [...chunk])),
      );
      return rows.map((row) => this.toTag(row));
    });
  }

  async insert(tag: Tag): Promise<void> {
    this.pending.add(
      this.db.insert(tags).values({
        id: tag.id,
        ownerId: tag.ownerId,
        name: tag.name,
        nameNormalized: normalizeName(tag.name),
        noteCount: tag.noteCount,
        version: tag.version,
        createdAt: tag.createdAt.toISOString(),
        updatedAt: tag.updatedAt.toISOString(),
      }),
    );
  }

  async save(tag: Tag, expectedVersion: ExpectedVersion<Tag>): Promise<void> {
    const tagId = tag.id;
    this.pending.addOcc(
      this.db
        .update(tags)
        .set({
          name: tag.name,
          nameNormalized: normalizeName(tag.name),
          noteCount: tag.noteCount,
          version: tag.version,
          updatedAt: tag.updatedAt.toISOString(),
        })
        .where(
          and(eq(tags.id, tag.id), eq(tags.version, expectedVersion as number)),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while saving tag ${tagId}: expected version ${expectedVersion}`,
        );
      },
    );
  }

  async delete(
    id: string,
    expectedVersion: ExpectedVersion<Tag>,
  ): Promise<void> {
    this.pending.addOcc(
      this.db
        .delete(tags)
        .where(
          and(eq(tags.id, id), eq(tags.version, expectedVersion as number)),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while deleting tag ${id}: expected version ${expectedVersion}`,
        );
      },
    );
  }
}
