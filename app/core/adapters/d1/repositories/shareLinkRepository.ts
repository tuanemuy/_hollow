import { and, count, eq, sql } from "drizzle-orm";
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
import type { NoteId } from "@/core/domain/note/valueObject";
import { ShareLink } from "@/core/domain/publication/entity";
import type { ShareLinkRepository } from "@/core/domain/publication/ports/shareLinkRepository";
import type {
  ShareLinkId,
  ShareLinkTokenHash,
} from "@/core/domain/publication/valueObject";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { shareLinks } from "../schema";
import { mapDbError } from "./helpers";

type ShareLinkRow = typeof shareLinks.$inferSelect;

/**
 * D1 implementation of `ShareLinkRepository`. Same buffered-batch /
 * OCC-token discipline as `D1NoteRepository`. The token hash is the
 * lookup key used by `ResolveShareLink`; the unique index on
 * `token_hash` ensures it is collision-free.
 */
export class D1ShareLinkRepository implements ShareLinkRepository {
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
    private readonly idGenerator: IdGenerator,
  ) {}

  private toEntity(row: ShareLinkRow): ShareLink {
    if (!this.idGenerator.validate(row.id)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored share_link has malformed id: ${row.id}`,
      );
    }
    try {
      return ShareLink.reconstruct({
        id: row.id,
        noteId: row.noteId,
        ownerId: row.ownerId,
        tokenHash: row.tokenHash,
        passwordHash: row.passwordHash,
        status: row.status,
        createdAt: new Date(row.createdAt),
        revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
        lastAccessedAt: row.lastAccessedAt
          ? new Date(row.lastAccessedAt)
          : null,
        failedAttempts: row.failedAttempts,
        lockedUntil: row.lockedUntil ? new Date(row.lockedUntil) : null,
        updatedAt: new Date(row.updatedAt),
        version: row.version,
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored share_link violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private toVersioned(row: ShareLinkRow): Versioned<ShareLink> {
    return {
      entity: this.toEntity(row),
      expectedVersion: row.version as ExpectedVersion<ShareLink>,
    };
  }

  findById(id: ShareLinkId): Promise<Versioned<ShareLink> | null> {
    return mapDbError("Failed to find share_link", async () => {
      const rows = await this.db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.id, id))
        .limit(1);
      const row = rows[0];
      return row ? this.toVersioned(row) : null;
    });
  }

  async insert(link: ShareLink): Promise<void> {
    this.pending.add(
      this.db.insert(shareLinks).values({
        id: link.id,
        noteId: link.noteId,
        ownerId: link.ownerId,
        tokenHash: link.tokenHash,
        passwordHash: link.passwordHash,
        status: link.status,
        failedAttempts: link.failedAttempts,
        lockedUntil: link.lockedUntil ? link.lockedUntil.toISOString() : null,
        createdAt: link.createdAt.toISOString(),
        revokedAt: link.revokedAt ? link.revokedAt.toISOString() : null,
        lastAccessedAt: link.lastAccessedAt
          ? link.lastAccessedAt.toISOString()
          : null,
        updatedAt: link.updatedAt.toISOString(),
        version: link.version,
      }),
    );
  }

  async save(
    link: ShareLink,
    expectedVersion: ExpectedVersion<ShareLink>,
  ): Promise<void> {
    const id = link.id;
    this.pending.addOcc(
      this.db
        .update(shareLinks)
        .set({
          passwordHash: link.passwordHash,
          status: link.status,
          failedAttempts: link.failedAttempts,
          lockedUntil: link.lockedUntil ? link.lockedUntil.toISOString() : null,
          revokedAt: link.revokedAt ? link.revokedAt.toISOString() : null,
          lastAccessedAt: link.lastAccessedAt
            ? link.lastAccessedAt.toISOString()
            : null,
          updatedAt: link.updatedAt.toISOString(),
          version: link.version,
        })
        .where(
          and(
            eq(shareLinks.id, link.id),
            eq(shareLinks.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while saving share_link ${id}: expected version ${expectedVersion}`,
        );
      },
    );
  }

  async delete(
    id: ShareLinkId,
    expectedVersion: ExpectedVersion<ShareLink>,
  ): Promise<void> {
    this.pending.addOcc(
      this.db
        .delete(shareLinks)
        .where(
          and(
            eq(shareLinks.id, id),
            eq(shareLinks.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while deleting share_link ${id}: expected version ${expectedVersion}`,
        );
      },
    );
  }

  findByTokenHash(hash: ShareLinkTokenHash): Promise<ShareLink | null> {
    return mapDbError("Failed to find share_link by token hash", async () => {
      const rows = await this.db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.tokenHash, hash))
        .limit(1);
      const row = rows[0];
      return row ? this.toEntity(row) : null;
    });
  }

  findByNoteId(noteId: NoteId): Promise<readonly ShareLink[]> {
    return mapDbError("Failed to list share_links by note", async () => {
      const rows = await this.db
        .select()
        .from(shareLinks)
        .where(eq(shareLinks.noteId, noteId))
        // Newest-first by creation. `created_at` is ISO8601 text so a plain
        // string comparison yields chronological order.
        .orderBy(sql`${shareLinks.createdAt} DESC`);
      return rows.map((row) => this.toEntity(row));
    });
  }

  countByNoteId(noteId: NoteId, includeRevoked: boolean): Promise<number> {
    return mapDbError("Failed to count share_links by note", async () => {
      const conditions = [eq(shareLinks.noteId, noteId)];
      if (!includeRevoked) {
        conditions.push(eq(shareLinks.status, "active"));
      }
      const rows = await this.db
        .select({ count: count() })
        .from(shareLinks)
        .where(and(...conditions));
      return Number(rows[0]?.count ?? 0);
    });
  }
}
