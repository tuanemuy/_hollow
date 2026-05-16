import { IndexJob, type NoteSnapshot } from "@/core/domain/search/entity";
import type { WorkerContainer } from "../di/types";

export type HandlePublicationChangedEventInput = Readonly<{
  snapshot: NoteSnapshot;
}>;

/**
 * Enqueues an `upsert` `IndexJob` so the index reflects the new
 * publication visibility.
 *
 * Although the publication change does not alter the note body,
 * `Visibility` is one of the search-document fields the public /
 * private surfaces filter on, so the projection must be refreshed.
 * Modelled as an upsert (rather than a partial update) so the same
 * `ConsumeIndexJob` path handles every kind of refresh uniformly.
 */
export async function handlePublicationChangedEvent(args: {
  container: WorkerContainer;
  input: HandlePublicationChangedEventInput;
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
