import type { MediaAssetId } from "@/core/domain/media/valueObject";
import type { ServiceArgs } from "../types";
import { attachMediaToNote } from "./attachMediaToNote";

export type DetachMediaFromNoteInput = Readonly<{
  noteBeforeIds: readonly MediaAssetId[];
}>;

/**
 * Convenience specialisation of `attachMediaToNote` for the "note went
 * away" path (note moved to trash / purged): every previously-attached
 * id is treated as removed, no new references appear.
 */
export async function detachMediaFromNote({
  container,
  input,
}: ServiceArgs<DetachMediaFromNoteInput>): Promise<void> {
  await attachMediaToNote({
    container,
    input: { noteBeforeIds: input.noteBeforeIds, noteAfterIds: [] },
  });
}
