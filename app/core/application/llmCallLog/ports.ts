import type { LlmCallLogEntry } from "./types";

/**
 * Write/prune port for the LLM-call-log read-model (#748 ADR-002 / ADR-003).
 *
 * Deliberately scoped to **write and prune only** — the read side (hourly
 * series + 24h scalar) lives in `D1UsageMetricsProvider`, which already
 * holds a `db` handle and derives the upload series the same way. Keeping
 * reads out of this port avoids the same aggregation drifting across two
 * implementations (recorder = write/prune, provider = read).
 *
 * Writes are synchronous best-effort: call sites invoke `recordCall`
 * directly after a successful LLM call and swallow failures, so a failed
 * record never breaks the preview/ingestion flow. There is no idempotency
 * key — `recordCall` is a plain insert (#748 ADR-008).
 *
 * Lives on both the {@link RequestContainer} (preview write) and the
 * {@link WorkerContainer} (ingestion write + pruner). It is kept off the
 * `UnitOfWorkContext`: the LLM call log is never written transactionally
 * inside an aggregate UoW (preview opens no UoW at all).
 */
export interface LlmCallLogRecorder {
  /**
   * Insert one LLM-call-log row (plain insert, no conflict handling —
   * #748 ADR-008). One row = one successful LLM API call.
   */
  recordCall(entry: LlmCallLogEntry): Promise<void>;

  /**
   * Delete rows whose `occurredAt` predates `cutoff` (retention pruning —
   * #748 ADR-005). Returns the number of rows removed.
   */
  pruneOlderThan(cutoff: Date): Promise<{ deleted: number }>;
}
