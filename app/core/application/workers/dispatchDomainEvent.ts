import type { DomainEvent } from "@/core/domain/common/event";
import { isBusinessRuleError } from "@/core/domain/error";
import { ExportJobId as ExportJobIdVO } from "@/core/domain/export/valueObject";
import { isLLMRateLimitError } from "@/core/domain/ingestion/ports/llmProvider";
import { IngestionJobId as IngestionJobIdVO } from "@/core/domain/ingestion/valueObject";
import type { RequestContainer } from "../di/types";
import type { IngestionJobId as IngestionJobIdDTO } from "../dto/ingestion";
import { NotFoundError } from "../errors";
import { runExportJob } from "../export/runExportJob";
import { runIngestionJob } from "../ingestion/runIngestionJob";

/**
 * Outcome returned by `dispatchDomainEvent` to the queue handler glue.
 *
 * - `handled` — usecase ran (or the error was unrecoverable in a way
 *   that redelivery cannot fix). Queue message should be stamped + acked.
 * - `skipped` — the event type has no dispatch target. Treated the same
 *   way as `handled` by the consumer (stamp + ack), but kept as a
 *   distinct tag so unit tests can prove specific event types
 *   (e.g. `ingestion.regenerated`) are intentionally not dispatched —
 *   regression guard against silent re-wiring.
 * - `retry` — a transient failure (D1 throw, `LLMRateLimitError`, any
 *   unexpected error). The consumer should call `message.retry()`
 *   without stamping so the next redelivery re-enters dispatch.
 */
export type DispatchOutcome =
  | { readonly kind: "handled" }
  | { readonly kind: "skipped" }
  | { readonly kind: "retry"; readonly error: unknown };

/**
 * Pure dispatch table for queue-delivered `DomainEvent`s.
 *
 * Routing:
 * - `ingestion.created` / `ingestion.retryRequested` → `runIngestionJob`
 * - `export.job.requested` / `export.job.retryRequested` → `runExportJob`
 * - Everything else → `skipped` (`note.*`, `publication.*`,
 *   `ingestion.previewAttached`, ...)
 *
 * `ingestion.regenerated` is intentionally NOT routed: `regenerate`
 * transitions `previewing → processing` directly, so `runIngestionJob`'s
 * `isPending` guard would no-op the call (see ADR-004 on Issue #57).
 *
 * Error classification (see ADR-005):
 * - `LLMRateLimitError` → `retry`. Note: in the ingestion path this only
 *   helps when the job is still in `pending` at the time of throw; once
 *   the usecase has committed `pending → processing`, the next
 *   redelivery's `isPending` guard no-ops the call and the job sits
 *   `processing` until `max_retries → DLQ → admin manual retry`
 *   (ADR-003 "既知の限界").
 * - `NotFoundError` (`INGESTION_JOB_NOT_FOUND` / `EXPORT_JOB_NOT_FOUND`)
 *   → `handled` — the row is gone, redelivery cannot resurrect it.
 *   Note: `runExportJob` swallows this internally, so the `EXPORT_JOB_NOT_FOUND`
 *   branch is effectively defensive code (kept symmetric with ingestion).
 * - `BusinessRuleError` → `handled` — VO factory throws on payload
 *   schema drift (e.g. empty `jobId`). Persistent shape mismatch will
 *   never recover via redelivery, so ack instead of looping until DLQ.
 *   Surfaces in `logger.warn` so an operator can spot drift.
 * - Anything else (D1 transient, UoW commit failure, etc.) → `retry`
 *   (queue backoff → eventually DLQ after `max_retries`).
 *
 * The container type is the minimal `RequestContainer`: dispatch does
 * not touch worker-only ports, so by LSP a `ConsumerContainer` subtype
 * passed in by the queue handler is accepted.
 */
export async function dispatchDomainEvent(
  container: RequestContainer,
  event: DomainEvent,
): Promise<DispatchOutcome> {
  try {
    switch (event.type) {
      case "ingestion.created":
      case "ingestion.retryRequested": {
        const payload = event.payload as Readonly<{ jobId: string }>;
        // `IngestionJobId` is split into domain VO (validating brand)
        // and `dto/ingestion.IngestionJobId` (transport brand). Construct
        // via the VO factory so payload drift throws `BusinessRuleError`
        // here, then cross the domain↔application boundary explicitly
        // to satisfy the usecase's DTO parameter shape.
        const jobId = IngestionJobIdVO.create(
          payload.jobId,
        ) as unknown as IngestionJobIdDTO;
        await runIngestionJob({ container, input: { jobId } });
        return { kind: "handled" };
      }
      case "export.job.requested":
      case "export.job.retryRequested": {
        const payload = event.payload as Readonly<{ exportJobId: string }>;
        const jobId = ExportJobIdVO.create(payload.exportJobId);
        await runExportJob({ container, input: { jobId } });
        return { kind: "handled" };
      }
      default:
        return { kind: "skipped" };
    }
  } catch (error) {
    if (isLLMRateLimitError(error)) {
      return { kind: "retry", error };
    }
    if (error instanceof NotFoundError) {
      return { kind: "handled" };
    }
    if (isBusinessRuleError(error)) {
      // Payload schema drift (e.g. empty jobId from a relay-side change)
      // — never recovers via redelivery; ack to avoid a retry loop.
      container.logger.warn(
        `[dispatch] business-rule violation for ${event.type}, acking to skip retry loop`,
        { eventId: event.id, eventType: event.type, cause: error },
      );
      return { kind: "handled" };
    }
    return { kind: "retry", error };
  }
}
