import type { LLMProvider } from "@/core/domain/adminSettings/valueObject";

/**
 * LLM-call-log read-model types.
 *
 * The LLM call log is an append-only read-model backing the admin
 * dashboard's "LLM 呼び出し" series and 24h scalar — not a domain concept
 * (#748 ADR-001). It records one row per *actual* LLM API call
 * (`structureToHtml` / `suggestMetadata`) so the dashboard can derive an
 * hourly time series and a 24h count.
 *
 * Recording is synchronous best-effort (#748 ADR-002): the call-site
 * usecase writes the row directly after a successful LLM call, swallowing
 * any write failure. There is no at-least-once redelivery window, so the
 * entry carries no idempotency key (`event_id`) — `recordCall` is a plain
 * insert (#748 ADR-008). As a consequence the dashboard figures are an
 * *approximation* (a swallowed write under-counts) and are not a billing
 * ledger.
 */

/**
 * One LLM-call-log row, ready to insert. `provider` is the *actually
 * constructed* provider's resolved name (not the raw env value) so the
 * dashboard reflects the real provider in use (#748 ADR-006). `occurredAt`
 * is the UTC instant of the call; the adapter persists it as ISO8601 text
 * so the hourly aggregation can reuse the `substr(occurred_at,1,13)` bucket
 * shared with the upload series (#748 ADR-007).
 */
export type LlmCallLogEntry = Readonly<{
  id: string;
  ownerId: string;
  provider: LLMProvider;
  occurredAt: Date;
}>;

/**
 * Retention window for `llm_call_log` before the pruner sweeps it (#748
 * ADR-005). Kept strictly larger than the 24h display window so the daily
 * prune tick can never remove a row the dashboard still needs to show,
 * regardless of when the tick lands.
 */
export const LLM_CALL_LOG_RETENTION_HOURS = 48;
