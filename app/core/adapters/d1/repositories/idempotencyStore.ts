import { eq, lt } from "drizzle-orm";
import type { Clock } from "@/core/application/ports/clock";
import type { IdempotencyStore } from "@/core/application/ports/idempotencyStore";
import type { EventId } from "@/core/domain/common/event";
import type { Database } from "../client";
import { processedEvents } from "../schema";
import { mapDbError } from "./helpers";

// Atomicity comes from `INSERT ... ON CONFLICT DO NOTHING RETURNING`
// under SQLite's per-statement write lock — empty RETURNING = lost race.
export class D1IdempotencyStore implements IdempotencyStore {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async hasProcessed(id: EventId): Promise<boolean> {
    return mapDbError("Failed to check processed event", async () => {
      const rows = await this.db
        .select({ id: processedEvents.id })
        .from(processedEvents)
        .where(eq(processedEvents.id, id))
        .limit(1);
      return rows.length > 0;
    });
  }

  async markProcessed(id: EventId): Promise<{ alreadyProcessed: boolean }> {
    return mapDbError("Failed to record processed event", async () => {
      const rows = await this.db
        .insert(processedEvents)
        .values({ id, processedAt: this.clock.now() })
        .onConflictDoNothing({ target: processedEvents.id })
        .returning({ id: processedEvents.id });
      return { alreadyProcessed: rows.length === 0 };
    });
  }

  async pruneProcessed(olderThan: Date): Promise<{ deleted: number }> {
    return mapDbError("Failed to prune processed events", async () => {
      const rows = await this.db
        .delete(processedEvents)
        .where(lt(processedEvents.processedAt, olderThan))
        .returning({ id: processedEvents.id });
      return { deleted: rows.length };
    });
  }
}
