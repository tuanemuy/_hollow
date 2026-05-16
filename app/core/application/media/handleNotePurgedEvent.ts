import type { NotePurgedEvent } from "@/core/domain/note/events";
import type { ServiceArgs } from "../types";
import { attachMediaToNote } from "./attachMediaToNote";

export type HandleNotePurgedEventInput = Readonly<{
  event: NotePurgedEvent;
}>;

/**
 * Queue-consumer hook fired when a Note is purged. Releases every media
 * reference the note held by treating the purged set as "all before / no
 * after". The shared `attachMediaToNote` handler keeps the diff logic in
 * a single place so the queue consumer and the post-save hook agree.
 */
export async function handleNotePurgedEvent({
  container,
  input,
}: ServiceArgs<HandleNotePurgedEventInput>): Promise<void> {
  await attachMediaToNote({
    container,
    input: {
      noteBeforeIds: input.event.payload.mediaRefs,
      noteAfterIds: [],
    },
  });
}
