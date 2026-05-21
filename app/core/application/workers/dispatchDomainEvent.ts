import type { DomainEvent } from "@/core/domain/common/event";
import {
  type ExportJobId,
  ExportJobId as ExportJobIdVO,
} from "@/core/domain/export/valueObject";
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
 * - `handled` — usecase ran (or the event type does not require any),
 *   and the queue message can be `ack`ed / stamped.
 * - `skipped` — the event type has no dispatch target. Treated the same
 *   way as `handled` by the consumer (stamp + ack); kept as a distinct
 *   tag so the test suite can prove specific types are intentionally
 *   not dispatched (regression guard).
 * - `retry` — a transient failure (`LLMRateLimitError`, D1 UoW throw,
 *   any unexpected error) — the consumer should call `message.retry()`
 *   without stamping, so the next redelivery re-enters the dispatch.
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
 * - Everything else → `skipped`
 *
 * `ingestion.regenerated` is intentionally NOT routed: `regenerate`
 * transitions `previewing → processing` directly, so `runIngestionJob`'s
 * `isPending` guard would no-op the call (see ADR-004 on Issue #57).
 *
 * Error classification:
 * - `LLMRateLimitError` → `retry` (rate limit self-resolves)
 * - `NotFoundError` (`INGESTION_JOB_NOT_FOUND` / `EXPORT_JOB_NOT_FOUND`)
 *   → `handled` (the row is gone; redelivery cannot resurrect it)
 * - Anything else (D1 UoW throws, etc.) → `retry`
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
        // Re-validate via the domain VO factory so a corrupted payload
        // (relay-side schema drift) throws here and is classified as
        // `retry` — Cloudflare Queues' max_retries will eventually push
        // the message to the DLQ rather than silently dropping it.
        const jobId = IngestionJobIdVO.create(
          payload.jobId,
        ) as unknown as IngestionJobIdDTO;
        await runIngestionJob({ container, input: { jobId } });
        return { kind: "handled" };
      }
      case "export.job.requested":
      case "export.job.retryRequested": {
        const payload = event.payload as Readonly<{ exportJobId: string }>;
        const jobId: ExportJobId = ExportJobIdVO.create(payload.exportJobId);
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
    return { kind: "retry", error };
  }
}
