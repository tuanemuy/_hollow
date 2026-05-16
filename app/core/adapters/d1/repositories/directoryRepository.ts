import { and, asc, eq, isNull, sql } from "drizzle-orm";
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
import { Directory } from "@/core/domain/directory/entity";
import type { DirectoryRepository } from "@/core/domain/directory/ports/directoryRepository";
import type {
  DirectoryId,
  DirectoryName,
} from "@/core/domain/directory/valueObject";
import { isRehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { directories } from "../schema";
import { mapDbError } from "./helpers";

type DirectoryRow = typeof directories.$inferSelect;

/**
 * D1 implementation of `DirectoryRepository`. Reads execute immediately
 * against the binding; writes register Drizzle query expressions on the
 * supplied `PendingBatch` so the surrounding `D1UnitOfWorkProvider`
 * flushes them atomically via `db.batch()`.
 *
 * OCC is enforced by the `ExpectedVersion<Directory>` token returned
 * from `findById`. This file is the only legitimate construction site
 * for the token (via the `as` cast inside `toVersioned`).
 *
 * Hierarchy invariants enforced at the schema level:
 *
 * - `uniq_directories_owner_root` (UNIQUE `owner_id` WHERE `parent_id IS
 *   NULL`) — at most one root per owner. A duplicate-root insert
 *   surfaces as `ConflictError("UNIQUE_VIOLATION")` via `mapDbError`.
 * - `uniq_directories_owner_parent_name` (UNIQUE `owner_id`,
 *   `parent_id`, `LOWER(name)`) — sibling-name uniqueness as a backstop
 *   to the domain service check; collisions also surface as
 *   `ConflictError("UNIQUE_VIOLATION")`.
 * - `parent_id REFERENCES directories(id) ON DELETE RESTRICT` — deleting
 *   a directory that still has children surfaces as
 *   `ConflictError("FOREIGN_KEY_VIOLATION")`.
 */
export class D1DirectoryRepository implements DirectoryRepository {
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
    private readonly idGenerator: IdGenerator,
  ) {}

  private toDirectory(row: DirectoryRow): Directory {
    if (!this.idGenerator.validate(row.id)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored directory has malformed id: ${row.id}`,
      );
    }
    try {
      return Directory.reconstruct({
        id: row.id,
        ownerId: row.ownerId,
        parentId: row.parentId,
        name: row.name,
        slug: row.slug,
        depth: row.depth,
        version: row.version,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored directory violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private toVersioned(row: DirectoryRow): Versioned<Directory> {
    return {
      entity: this.toDirectory(row),
      expectedVersion: row.version as ExpectedVersion<Directory>,
    };
  }

  findById(id: string): Promise<Versioned<Directory> | null> {
    return mapDbError("Failed to find directory", async () => {
      const rows = await this.db
        .select()
        .from(directories)
        .where(eq(directories.id, id))
        .limit(1);
      const row = rows[0];
      return row ? this.toVersioned(row) : null;
    });
  }

  findRoot(ownerId: UserId): Promise<Directory | null> {
    return mapDbError("Failed to find root directory", async () => {
      const rows = await this.db
        .select()
        .from(directories)
        .where(
          and(eq(directories.ownerId, ownerId), isNull(directories.parentId)),
        )
        .limit(1);
      const row = rows[0];
      return row ? this.toDirectory(row) : null;
    });
  }

  findChildren(parentId: DirectoryId): Promise<readonly Directory[]> {
    return mapDbError("Failed to list directory children", async () => {
      const rows = await this.db
        .select()
        .from(directories)
        .where(eq(directories.parentId, parentId))
        .orderBy(asc(directories.name), asc(directories.id));
      return rows.map((row) => this.toDirectory(row));
    });
  }

  findTree(ownerId: UserId): Promise<readonly Directory[]> {
    return mapDbError("Failed to list directory tree", async () => {
      const rows = await this.db
        .select()
        .from(directories)
        .where(eq(directories.ownerId, ownerId))
        .orderBy(
          asc(directories.depth),
          asc(directories.name),
          asc(directories.id),
        );
      return rows.map((row) => this.toDirectory(row));
    });
  }

  findAncestors(id: DirectoryId): Promise<readonly Directory[]> {
    return mapDbError("Failed to list directory ancestors", async () => {
      // Depth is bounded to MAX_DIRECTORY_DEPTH (10) by the domain, so
      // walking parent pointers in JS costs at most a handful of point
      // reads — cheaper than maintaining a recursive-CTE raw-SQL path
      // and avoids the snake_case ↔ camelCase rehydration mismatch that
      // raw-SQL projections incur.
      const seedRows = await this.db
        .select()
        .from(directories)
        .where(eq(directories.id, id))
        .limit(1);
      const seed = seedRows[0];
      if (!seed) return [];

      const chain: DirectoryRow[] = [];
      let currentParent: string | null = seed.parentId;
      const visited = new Set<string>([seed.id]);
      while (currentParent !== null) {
        if (visited.has(currentParent)) {
          // Cycle: stored data is inconsistent. Surface as data
          // integrity rather than loop forever.
          throw new SystemError(
            SystemErrorCode.DataIntegrityError,
            `Directory ancestor chain forms a cycle at ${currentParent}`,
          );
        }
        visited.add(currentParent);
        const parentRows: DirectoryRow[] = await this.db
          .select()
          .from(directories)
          .where(eq(directories.id, currentParent))
          .limit(1);
        const parentRow = parentRows[0];
        if (!parentRow) break;
        chain.push(parentRow);
        currentParent = parentRow.parentId;
      }

      // Walk was target → root; reverse to satisfy "root-first" contract.
      return chain.reverse().map((row) => this.toDirectory(row));
    });
  }

  findBySiblingName(
    parentId: DirectoryId | null,
    ownerId: UserId,
    name: DirectoryName,
  ): Promise<Directory | null> {
    return mapDbError("Failed to find directory by sibling name", async () => {
      const parentPredicate =
        parentId === null
          ? isNull(directories.parentId)
          : eq(directories.parentId, parentId);
      const rows = await this.db
        .select()
        .from(directories)
        .where(
          and(
            eq(directories.ownerId, ownerId),
            parentPredicate,
            sql`LOWER(${directories.name}) = LOWER(${name})`,
          ),
        )
        .limit(1);
      const row = rows[0];
      return row ? this.toDirectory(row) : null;
    });
  }

  async insert(directory: Directory): Promise<void> {
    this.pending.add(
      this.db.insert(directories).values({
        id: directory.id,
        ownerId: directory.ownerId,
        parentId: directory.parentId,
        name: directory.name,
        slug: directory.slug,
        depth: directory.depth,
        version: directory.version,
        createdAt: directory.createdAt.toISOString(),
        updatedAt: directory.updatedAt.toISOString(),
      }),
    );
  }

  async save(
    directory: Directory,
    expectedVersion: ExpectedVersion<Directory>,
  ): Promise<void> {
    const directoryId = directory.id;
    this.pending.addOcc(
      this.db
        .update(directories)
        .set({
          parentId: directory.parentId,
          name: directory.name,
          slug: directory.slug,
          depth: directory.depth,
          version: directory.version,
          updatedAt: directory.updatedAt.toISOString(),
        })
        .where(
          and(
            eq(directories.id, directory.id),
            eq(directories.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while saving directory ${directoryId}: expected version ${expectedVersion}`,
        );
      },
    );
  }

  async delete(
    id: string,
    expectedVersion: ExpectedVersion<Directory>,
  ): Promise<void> {
    this.pending.addOcc(
      this.db
        .delete(directories)
        .where(
          and(
            eq(directories.id, id),
            eq(directories.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while deleting directory ${id}: expected version ${expectedVersion}`,
        );
      },
    );
  }
}
