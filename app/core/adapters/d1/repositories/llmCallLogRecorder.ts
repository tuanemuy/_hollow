import { lt } from "drizzle-orm";
import type { LlmCallLogRecorder } from "@/core/application/llmCallLog/ports";
import type { LlmCallLogEntry } from "@/core/application/llmCallLog/types";
import type { Database } from "../client";
import { llmCallLog } from "../schema";
import { mapDbError } from "./helpers";

/**
 * D1 implementation of {@link LlmCallLogRecorder} (#748).
 *
 * `recordCall` is a plain insert — no `onConflict` / unique key, because
 * the synchronous best-effort write has no redelivery window and therefore
 * needs no idempotency key (#748 ADR-008). `occurred_at` is stored as
 * ISO8601 UTC text so the read side (`D1UsageMetricsProvider`) can reuse the
 * `substr(occurred_at,1,13)` hour bucket shared with the upload series
 * (#748 ADR-007).
 *
 * Reads (hourly series / 24h scalar) deliberately live in
 * `D1UsageMetricsProvider`, not here (#748 ADR-003): this port is
 * write/prune only.
 */
export class D1LlmCallLogRecorder implements LlmCallLogRecorder {
  constructor(private readonly db: Database) {}

  async recordCall(entry: LlmCallLogEntry): Promise<void> {
    await mapDbError("Failed to record llm call log entry", async () => {
      await this.db.insert(llmCallLog).values({
        id: entry.id,
        ownerId: entry.ownerId,
        provider: entry.provider,
        occurredAt: entry.occurredAt.toISOString(),
        // `created_at` is a diagnostic-only physical-write timestamp, never
        // read by the series/scalar aggregations (#748). Because this is a
        // synchronous best-effort write taken right after the LLM call,
        // `occurredAt` already coincides with the record time — so we reuse it
        // instead of pulling in a dedicated `clock` dependency on the adapter.
        createdAt: entry.occurredAt,
      });
    });
  }

  async pruneOlderThan(cutoff: Date): Promise<{ deleted: number }> {
    return mapDbError("Failed to prune llm call log", async () => {
      const rows = await this.db
        .delete(llmCallLog)
        .where(lt(llmCallLog.occurredAt, cutoff.toISOString()))
        .returning({ id: llmCallLog.id });
      return { deleted: rows.length };
    });
  }
}
