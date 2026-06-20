import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { SystemError, SystemErrorCode } from "@/core/application/errors";
import { isRehydrationError } from "@/core/domain/error";
import type { NoteRevisionRepository } from "@/core/domain/note/ports/noteRevisionRepository";
import { NoteRevision } from "@/core/domain/note/revision";
import type {
  FrontMatterRecord,
  NoteId,
  NoteRevisionId,
} from "@/core/domain/note/valueObject";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { noteRevisions } from "../schema";
import { mapDbError } from "./helpers";

type NoteRevisionRow = typeof noteRevisions.$inferSelect;

/**
 * D1 implementation of `NoteRevisionRepository`.
 *
 * Reads execute immediately against the binding; writes (insert and
 * prune) register Drizzle query expressions on the supplied
 * `PendingBatch` so the surrounding `D1UnitOfWorkProvider` flushes them
 * atomically with the `Note` write that motivated the revision.
 *
 * The aggregate is append-only and carries no OCC token — see
 * `NoteRevisionRepository` JSDoc for rationale.
 */
export class D1NoteRevisionRepository implements NoteRevisionRepository {
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
  ) {}

  private parseTimestamp(
    value: string,
    field: string,
    revisionId: string,
  ): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored note_revision ${revisionId} has malformed ${field}: ${value}`,
      );
    }
    return parsed;
  }

  private parseFrontMatter(
    value: string,
    revisionId: string,
  ): FrontMatterRecord {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch (cause) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored note_revision ${revisionId} has malformed front_matter_json`,
        cause,
      );
    }
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored note_revision ${revisionId} front_matter_json is not an object`,
      );
    }
    return parsed as FrontMatterRecord;
  }

  private toRevision(row: NoteRevisionRow): NoteRevision {
    try {
      return NoteRevision.reconstruct({
        id: row.id,
        noteId: row.noteId,
        ownerId: row.ownerId,
        title: row.title,
        contentHtml: row.contentHtml,
        frontMatter: this.parseFrontMatter(row.frontMatterJson, row.id),
        createdByUserId: row.createdByUserId,
        createdAt: this.parseTimestamp(row.createdAt, "created_at", row.id),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          `Stored note_revision ${row.id} violates invariants`,
          error,
        );
      }
      throw error;
    }
  }

  findById(id: NoteRevisionId): Promise<NoteRevision | null> {
    return mapDbError("Failed to find note revision", async () => {
      const rows = await this.db
        .select()
        .from(noteRevisions)
        .where(eq(noteRevisions.id, id))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return this.toRevision(row);
    });
  }

  findByNoteId(
    noteId: NoteId,
    opts: Readonly<{ limit: number; offset: number }>,
  ): Promise<readonly NoteRevision[]> {
    return mapDbError("Failed to list note revisions", async () => {
      const rows = await this.db
        .select()
        .from(noteRevisions)
        .where(eq(noteRevisions.noteId, noteId))
        .orderBy(desc(noteRevisions.createdAt), desc(noteRevisions.id))
        .limit(opts.limit)
        .offset(opts.offset);
      return rows.map((row) => this.toRevision(row));
    });
  }

  countByNoteId(noteId: NoteId): Promise<number> {
    return mapDbError("Failed to count note revisions", async () => {
      const rows = await this.db
        .select({ value: count() })
        .from(noteRevisions)
        .where(eq(noteRevisions.noteId, noteId));
      return Number(rows[0]?.value ?? 0);
    });
  }

  async insert(revision: NoteRevision): Promise<void> {
    this.pending.add(
      this.db.insert(noteRevisions).values({
        id: revision.id,
        noteId: revision.noteId,
        ownerId: revision.ownerId,
        title: revision.title,
        contentHtml: revision.contentHtml,
        frontMatterJson: JSON.stringify(revision.frontMatter),
        createdByUserId: revision.createdByUserId,
        createdAt: revision.createdAt.toISOString(),
      }),
    );
  }

  async deleteOldestForNote(
    noteId: NoteId,
    keepCount: number,
  ): Promise<number> {
    return mapDbError("Failed to prune oldest note revisions", async () => {
      // Always-keep-N pruning: read the ids of any row past the
      // newest-first slice of `keepCount` so the DELETE can target them
      // explicitly. Two-step (SELECT then DELETE) keeps the SQL simple
      // and works under D1's no-correlated-DELETE / single-statement
      // restriction inside the batched flush.
      const stale = await this.db
        .select({ id: noteRevisions.id })
        .from(noteRevisions)
        .where(eq(noteRevisions.noteId, noteId))
        .orderBy(asc(noteRevisions.createdAt), asc(noteRevisions.id))
        .limit(Number.MAX_SAFE_INTEGER)
        .offset(0);
      if (stale.length <= keepCount) {
        return 0;
      }
      const toDelete = stale
        .slice(0, stale.length - keepCount)
        .map((r) => r.id);
      if (toDelete.length === 0) return 0;
      this.pending.add(
        this.db
          .delete(noteRevisions)
          .where(
            and(
              eq(noteRevisions.noteId, noteId),
              inArray(noteRevisions.id, toDelete),
            ),
          ),
      );
      return toDelete.length;
    });
  }
}
