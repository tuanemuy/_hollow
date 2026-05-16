import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
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
import { NoteId } from "@/core/domain/note/valueObject";
import { PublicationState } from "@/core/domain/publication/entity";
import type {
  PublicationListOpts,
  PublicationStateRepository,
} from "@/core/domain/publication/ports/publicationStateRepository";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { publicationStates } from "../schema";
import { mapDbError } from "./helpers";

type PublicationStateRow = typeof publicationStates.$inferSelect;

/**
 * D1 implementation of `PublicationStateRepository`. Mirrors
 * `D1TodoRepository` — reads run immediately, writes buffer onto the
 * surrounding `PendingBatch` so `D1UnitOfWorkProvider` can flush them
 * atomically. The aggregate id is `NoteId`; the table's primary key
 * column `note_id` doubles as that id, so `findById` and `findByNoteId`
 * (the spec wording) collapse onto the same operation.
 */
export class D1PublicationStateRepository
  implements PublicationStateRepository
{
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
    private readonly idGenerator: IdGenerator,
  ) {}

  private toEntity(row: PublicationStateRow): PublicationState {
    if (!this.idGenerator.validate(row.noteId)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored publication_state has malformed note id: ${row.noteId}`,
      );
    }
    try {
      return PublicationState.reconstruct({
        noteId: row.noteId,
        ownerId: row.ownerId,
        visibility: row.visibility,
        publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
        updatedAt: new Date(row.updatedAt),
        version: row.version,
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored publication_state violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private toVersioned(row: PublicationStateRow): Versioned<PublicationState> {
    return {
      entity: this.toEntity(row),
      expectedVersion: row.version as ExpectedVersion<PublicationState>,
    };
  }

  findById(id: NoteId): Promise<Versioned<PublicationState> | null> {
    return mapDbError("Failed to find publication_state", async () => {
      const rows = await this.db
        .select()
        .from(publicationStates)
        .where(eq(publicationStates.noteId, id))
        .limit(1);
      const row = rows[0];
      return row ? this.toVersioned(row) : null;
    });
  }

  async insert(state: PublicationState): Promise<void> {
    this.pending.add(
      this.db.insert(publicationStates).values({
        noteId: state.noteId,
        ownerId: state.ownerId,
        visibility: state.visibility,
        publishedAt: state.publishedAt ? state.publishedAt.toISOString() : null,
        updatedAt: state.updatedAt.toISOString(),
        version: state.version,
      }),
    );
  }

  async save(
    state: PublicationState,
    expectedVersion: ExpectedVersion<PublicationState>,
  ): Promise<void> {
    const noteId = state.noteId;
    this.pending.addOcc(
      this.db
        .update(publicationStates)
        .set({
          visibility: state.visibility,
          publishedAt: state.publishedAt
            ? state.publishedAt.toISOString()
            : null,
          updatedAt: state.updatedAt.toISOString(),
          version: state.version,
        })
        .where(
          and(
            eq(publicationStates.noteId, state.noteId),
            eq(publicationStates.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while saving publication_state ${noteId}: expected version ${expectedVersion}`,
        );
      },
    );
  }

  async delete(
    id: NoteId,
    expectedVersion: ExpectedVersion<PublicationState>,
  ): Promise<void> {
    this.pending.addOcc(
      this.db
        .delete(publicationStates)
        .where(
          and(
            eq(publicationStates.noteId, id),
            eq(publicationStates.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while deleting publication_state ${id}: expected version ${expectedVersion}`,
        );
      },
    );
  }

  findPublicByOwner(
    ownerId: UserId,
    opts: PublicationListOpts,
  ): Promise<readonly NoteId[]> {
    return mapDbError("Failed to list public publication_states", async () => {
      // `published_at` is set whenever visibility is `public` (and cleared on
      // transitions away from public), so ordering by it gives a stable
      // timeline. The note id is used as a deterministic tiebreaker and as
      // the keyset cursor.
      const conditions = [
        eq(publicationStates.ownerId, ownerId),
        eq(publicationStates.visibility, "public"),
        isNotNull(publicationStates.publishedAt),
      ];
      if (opts.cursor !== undefined) {
        conditions.push(sql`${publicationStates.noteId} > ${opts.cursor}`);
      }
      const rows = await this.db
        .select({ noteId: publicationStates.noteId })
        .from(publicationStates)
        .where(and(...conditions))
        .orderBy(asc(publicationStates.noteId))
        .limit(opts.limit);
      return rows.map((r) => NoteId.create(r.noteId));
    });
  }

  findAllPublic(
    opts: PublicationListOpts,
  ): Promise<readonly Readonly<{ ownerId: UserId; noteId: NoteId }>[]> {
    return mapDbError(
      "Failed to enumerate public publication_states",
      async () => {
        const conditions = [
          eq(publicationStates.visibility, "public"),
          isNotNull(publicationStates.publishedAt),
        ];
        if (opts.cursor !== undefined) {
          conditions.push(sql`${publicationStates.noteId} > ${opts.cursor}`);
        }
        const rows = await this.db
          .select({
            ownerId: publicationStates.ownerId,
            noteId: publicationStates.noteId,
          })
          .from(publicationStates)
          .where(and(...conditions))
          .orderBy(asc(publicationStates.noteId))
          .limit(opts.limit);
        return rows.map((r) => ({
          ownerId: r.ownerId as UserId,
          noteId: NoteId.create(r.noteId),
        }));
      },
    );
  }
}
