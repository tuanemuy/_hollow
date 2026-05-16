import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { SystemError, SystemErrorCode } from "@/core/application/errors";
import type { Clock } from "@/core/application/ports/clock";
import type { IdGenerator } from "@/core/application/ports/idGenerator";
import { isRehydrationError } from "@/core/domain/error";
import { NoteId } from "@/core/domain/note/valueObject";
import { IndexJob } from "@/core/domain/search/entity";
import type { IndexJobRepository } from "@/core/domain/search/ports/indexJobRepository";
import type { IndexJobId } from "@/core/domain/search/valueObject";
import type { Database } from "../client";
import { indexJobs } from "../schema";
import { mapDbError } from "./helpers";

type IndexJobRow = typeof indexJobs.$inferSelect;

/**
 * D1 implementation of `IndexJobRepository`.
 *
 * Reads and writes execute immediately against the D1 binding — index
 * jobs are not part of any aggregate UoW. The relay-style consumer that
 * drives this port runs outside a UoW, and the producer (the Note
 * outbox consumer) enqueues a single row per upstream event.
 *
 * `nextBatch` claims pending rows by stamping `attempts++` in a single
 * `UPDATE … RETURNING`. The `attempts` increment is the effective claim:
 * the row is still selectable on the next tick (we do not gate on the
 * pre-increment count), so concurrent workers may observe the same job
 * and dispatch it more than once. The downstream `SearchIndex` upsert /
 * delete contract is idempotent, so duplicate dispatches converge to the
 * same state. This adapter accepts at-least-once semantics; strict
 * mutual exclusion would require schema columns (`claimed_at`,
 * `claimed_by`) that `index_jobs` deliberately omits — the Note outbox
 * already provides the ordering guarantees this layer needs.
 *
 * `complete` marks `processed_at` so the row no longer appears in
 * `nextBatch`; rows are physically removed by an out-of-band pruner.
 * Keeping the row visible until then preserves diagnostic value
 * (`attempts`, `last_error`) for failed-then-recovered jobs.
 */
export class D1IndexJobRepository implements IndexJobRepository {
  constructor(
    private readonly db: Database,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async enqueue(job: IndexJob): Promise<void> {
    await mapDbError("Failed to enqueue index job", async () => {
      await this.db.insert(indexJobs).values({
        id: job.id,
        noteId: job.noteId,
        op: job.op,
        payloadJson: null,
        attempts: job.attempts,
        lastError: job.lastError,
        enqueuedAt: job.enqueuedAt.toISOString(),
        processedAt: null,
      });
    });
  }

  async nextBatch(limit: number, now: Date): Promise<readonly IndexJob[]> {
    if (!Number.isInteger(limit) || limit <= 0) return [];
    return mapDbError("Failed to fetch next index job batch", async () => {
      // Inner SELECT picks the oldest pending rows; the outer UPDATE
      // increments `attempts` and returns the full row in one
      // statement. SQLite's per-statement write lock serialises
      // concurrent workers — the second observes the first's increment
      // committed and its inner SELECT still returns the same rows
      // (the filter is `processed_at IS NULL`, which neither worker
      // changed). Duplicate dispatches are accepted; consumers are
      // expected to be idempotent. `now` is on the port signature so
      // the adapter has a deterministic clock available if a future
      // schema adds a `claimed_at` column, but the current rows have
      // no per-claim timestamp.
      void now;
      const eligibleIds = this.db
        .select({ id: indexJobs.id })
        .from(indexJobs)
        .where(isNull(indexJobs.processedAt))
        .orderBy(asc(indexJobs.enqueuedAt), asc(indexJobs.id))
        .limit(limit);

      const rows = await this.db
        .update(indexJobs)
        .set({ attempts: sql`${indexJobs.attempts} + 1` })
        .where(
          and(
            isNull(indexJobs.processedAt),
            sql`${indexJobs.id} IN ${eligibleIds}`,
          ),
        )
        .returning({
          id: indexJobs.id,
          noteId: indexJobs.noteId,
          op: indexJobs.op,
          attempts: indexJobs.attempts,
          lastError: indexJobs.lastError,
          enqueuedAt: indexJobs.enqueuedAt,
          processedAt: indexJobs.processedAt,
          payloadJson: indexJobs.payloadJson,
        });

      // RETURNING does not preserve the inner SELECT's ORDER BY; resort
      // by `enqueued_at, id` so the caller observes FIFO-ish order.
      const sorted = [...rows].sort((a, b) => {
        if (a.enqueuedAt !== b.enqueuedAt) {
          return a.enqueuedAt < b.enqueuedAt ? -1 : 1;
        }
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });

      return sorted.map((row) => this.toIndexJob(row));
    });
  }

  async complete(id: IndexJobId): Promise<void> {
    await mapDbError("Failed to complete index job", async () => {
      const now = this.clock.now().toISOString();
      await this.db
        .update(indexJobs)
        .set({ processedAt: now })
        .where(and(eq(indexJobs.id, id), isNull(indexJobs.processedAt)));
    });
  }

  async fail(id: IndexJobId, error: string, now: Date): Promise<void> {
    await mapDbError("Failed to record index job failure", async () => {
      // `now` is unused for column writes (the queue does not track a
      // per-attempt timestamp) but kept on the signature so the port
      // stays deterministic — adapters never reach for `Date.now()`.
      void now;
      await this.db
        .update(indexJobs)
        .set({
          lastError: error,
          attempts: sql`${indexJobs.attempts} + 1`,
        })
        .where(and(eq(indexJobs.id, id), isNull(indexJobs.processedAt)));
    });
  }

  private toIndexJob(row: IndexJobRow): IndexJob {
    if (!this.idGenerator.validate(row.id)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored index job has malformed id: ${row.id}`,
      );
    }
    if (!this.idGenerator.validate(row.noteId)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored index job has malformed noteId: ${row.noteId}`,
      );
    }
    try {
      return IndexJob.reconstruct({
        id: row.id,
        noteId: NoteId.create(row.noteId),
        op: row.op,
        attempts: row.attempts,
        lastError: row.lastError,
        enqueuedAt: new Date(row.enqueuedAt),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored index job violates invariants",
          error,
        );
      }
      throw error;
    }
  }
}
