import { IndexJob, type NoteSnapshot } from "@/core/domain/search/entity";
import type { WorkerContainer } from "../di/types";

export type HandleNoteSavedEventInput = Readonly<{
  snapshot: NoteSnapshot;
}>;

/**
 * Enqueues an `upsert` `IndexJob` carrying the inbound `NoteSnapshot`.
 *
 * The handler is the search-side consumer of the synthetic
 * `note.saved` event emitted by Note usecases (Create / Save / Rename
 * / Move / Restore, etc.). It is intentionally idempotent at the
 * downstream consumer (`ConsumeIndexJob` re-applies the latest
 * snapshot keyed on `noteId`), so duplicate dispatch from the
 * at-least-once outbox is safe.
 *
 * Operates on a `WorkerContainer` because it runs inside the queue
 * consumer, outside any aggregate UoW — the index is a derived
 * projection and the canonical truth lives upstream in the Note
 * aggregate.
 */
export async function handleNoteSavedEvent(args: {
  container: WorkerContainer;
  input: HandleNoteSavedEventInput;
}): Promise<void> {
  const { container, input } = args;
  const now = container.clock.now();
  const id = container.idGenerator.next();
  const job = IndexJob.create(
    {
      id,
      noteId: input.snapshot.noteId,
      op: "upsert",
      snapshot: input.snapshot,
    },
    now,
  );
  await container.indexJobRepository.enqueue(job);
}
