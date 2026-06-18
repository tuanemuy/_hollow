import type { EventId } from "@/core/domain/common/event";

/**
 * Atomic claim keyed on `event.id`. Concurrent callers on the same id
 * observe exactly one `alreadyProcessed: false`.
 */
export interface IdempotencyStore {
  /**
   * Side-effect-free existence check. Use this to dedup a delivery
   * *before* dispatching the handler so a transient failure inside the
   * handler can be retried — once `markProcessed` is called the row is
   * committed and any subsequent redelivery will be skipped, which would
   * otherwise prevent retry paths (e.g. `LLMRateLimitError`) from
   * functioning. Race window vs. `markProcessed` is acceptable because
   * the unit-of-work side (`isPending` + OCC) provides the canonical
   * second line of defence against double-execution.
   */
  hasProcessed(id: EventId): Promise<boolean>;
  markProcessed(id: EventId): Promise<{ alreadyProcessed: boolean }>;
  /**
   * Time-based GC of processed records. Deletes rows stamped strictly
   * before `olderThan`. The caller must pass a cutoff that exceeds the
   * queue's maximum redelivery window so only records that can no longer
   * gate a redelivery are removed — pruning a younger row would let a
   * redelivered, already-handled event re-dispatch (Issue #747).
   */
  pruneProcessed(olderThan: Date): Promise<{ deleted: number }>;
}
