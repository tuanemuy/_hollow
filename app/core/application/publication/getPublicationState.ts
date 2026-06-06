import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { ServiceArgs } from "../types";
import { loadOwnedNote } from "./internal";
import { type PublicationStateDTO, toPublicationStateDTO } from "./view";

export type GetPublicationStateInput = Readonly<{
  actorUserId: string;
  noteId: string;
}>;

export type GetPublicationStateOutput = Readonly<{
  publicationState: PublicationStateDTO | null;
}>;

/**
 * Owner-facing read of a note's publication state. Mirrors the owner gate
 * of {@link listShareLinks} (exists + owner via `loadOwnedNote`, then an
 * explicit `active` check) so the two publication reads share one contract;
 * `null` is returned when the note has no publication-state row yet
 * (default-private notes).
 */
export async function getPublicationState({
  container,
  input,
}: ServiceArgs<GetPublicationStateInput>): Promise<GetPublicationStateOutput> {
  const actorUserId = input.actorUserId as UserId;
  const noteId = input.noteId as NoteId;
  const publicationState = await container.unitOfWorkProvider.run(
    async ({ noteRepository, publicationStateRepository }) => {
      const note = await loadOwnedNote(noteRepository, noteId, actorUserId);
      if (note.status !== "active") {
        throw new BusinessRuleError(
          NoteErrorCode.Trashed,
          `Note ${input.noteId} is trashed; publication state is not readable`,
        );
      }
      const found = await publicationStateRepository.findById(noteId);
      return found === null ? null : toPublicationStateDTO(found.entity);
    },
  );

  return { publicationState };
}
