import { and, asc, desc, eq, inArray, like } from "drizzle-orm";
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
import { tags } from "../schema";
import { mapDbError } from "./helpers";

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
 * Escapes the SQL `LIKE` wildcards (`%` and `_`) and the backslash
 * escape character so a user-supplied `query` substring matches
 * literally. Paired with `ESCAPE '\\'` on the predicate so SQLite
 * recognises the escape character.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
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

  findByOwner(ownerId: UserId, opts: TagListOpts): Promise<readonly Tag[]> {
    return mapDbError("Failed to list tags by owner", async () => {
      const sortKey = opts.sort ?? "name";
      const order = opts.order ?? "asc";
      const direction = order === "desc" ? desc : asc;
      const sortColumn =
        sortKey === "noteCount"
          ? tags.noteCount
          : sortKey === "createdAt"
            ? tags.createdAt
            : tags.nameNormalized;

      const trimmedQuery = opts.query?.trim() ?? "";
      const whereExpr =
        trimmedQuery.length > 0
          ? and(
              eq(tags.ownerId, ownerId),
              like(
                tags.nameNormalized,
                `%${escapeLikePattern(trimmedQuery.toLowerCase())}%`,
              ),
            )
          : eq(tags.ownerId, ownerId);

      const rows = await this.db
        .select()
        .from(tags)
        .where(whereExpr)
        .orderBy(direction(sortColumn), asc(tags.id))
        .limit(opts.limit)
        .offset(opts.offset);
      return rows.map((row) => this.toTag(row));
    });
  }

  findByIds(ids: readonly TagId[]): Promise<readonly Tag[]> {
    return mapDbError("Failed to find tags by ids", async () => {
      if (ids.length === 0) return [];
      const rows = await this.db
        .select()
        .from(tags)
        .where(inArray(tags.id, ids as readonly string[] as string[]));
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
