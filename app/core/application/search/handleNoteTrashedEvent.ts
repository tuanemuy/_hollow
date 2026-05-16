import type { NoteId } from "@/core/domain/note/valueObject";
import { IndexJob } from "@/core/domain/search/entity";
import type { WorkerContainer } from "../di/types";

export type HandleNoteTrashedEventInput = Readonly<{
  noteId: NoteId;
}>;

/**
 * Enqueues a `delete` `IndexJob` for the trashed note.
 *
 * The trash transition removes the note from public + private search
 * surfaces alike; the downstream consumer hands the noteId to
 * `SearchIndex.delete`, which is idempotent at the adapter level.
 */
export async function handleNoteTrashedEvent(args: {
  container: WorkerContainer;
  input: HandleNoteTrashedEventInput;
}): Promise<void> {
  const { container, input } = args;
  const now = container.clock.now();
  const id = container.idGenerator.next();
  const job = IndexJob.create(
    {
      id,
      noteId: input.noteId,
      op: "delete",
      snapshot: null,
    },
    now,
  );
  await container.indexJobRepository.enqueue(job);
}
