import type { ExportJobCompletedEvent } from "@/core/domain/export/events";
import type { ConsumerContainer } from "../di/types";

export type HandleExportJobCompletedEventInput = Readonly<{
  event: ExportJobCompletedEvent;
}>;

/**
 * Project an `export.job.completed` event into the activity log (ADR-003).
 *
 * This is the only "バックアップ"-adjacent activity the codebase actually
 * emits — a **per-owner** export completion. The mock's "D1 / nightly"
 * system backup has no real subsystem, so it is NOT written (虚偽表示禁止).
 * The label is the real semantic ("エクスポート完了"). Looks up the job
 * through a read-only UoW to resolve the owner handle and the artifact
 * format for the "対象" / "詳細" columns.
 */
export async function handleExportJobCompletedEvent({
  container,
  input,
}: {
  container: ConsumerContainer;
  input: HandleExportJobCompletedEventInput;
}): Promise<void> {
  const { event } = input;
  const now = container.clock.now();
  const exportJobId = event.payload.exportJobId;

  const job = await container.unitOfWorkProvider.run(
    async ({ exportJobRepository }) => {
      const versioned = await exportJobRepository.findById(exportJobId);
      return versioned?.entity ?? null;
    },
  );

  await container.activityLogRepository.insertIfAbsent({
    id: container.idGenerator.next(),
    eventId: event.id,
    kind: "export_completed",
    actorId: job?.ownerId ?? null,
    target: job ? `${job.format} エクスポート` : exportJobId,
    detail: "エクスポート完了",
    severity: "success",
    occurredAt: event.occurredAt,
    createdAt: now,
  });
}
