import { DirectoryService } from "@/core/domain/directory/service";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import type { BacklinkDTO, NoteDTO } from "./view";
import { buildBacklinkSnippet, toBacklink, toNoteView } from "./view";

export type GetNoteDetailInput = Readonly<{
  actorUserId: UserId;
  noteId: NoteId;
}>;

export type GetNoteDetailOutput = Readonly<{
  note: NoteDTO;
  backlinks: readonly BacklinkDTO[];
  directoryPath: string;
  directorySegments: readonly { id: string; name: string }[];
}>;

export async function getNoteDetail({
  container,
  input,
}: ServiceArgs<GetNoteDetailInput>): Promise<GetNoteDetailOutput> {
  return container.unitOfWorkProvider.run(async (ctx) => {
    const found = await ctx.noteRepository.findById(input.noteId);
    if (!found) {
      throw new NotFoundError(
        "NOTE_NOT_FOUND",
        `Note not found: ${input.noteId}`,
      );
    }
    if (found.entity.ownerId !== input.actorUserId) {
      throw new ForbiddenError(
        "NOTE_FORBIDDEN",
        `Note ${input.noteId} is owned by another user`,
      );
    }
    const referrers = await ctx.noteRepository.findReferrers(found.entity.id);
    const dir = await ctx.directoryRepository.findById(
      found.entity.directoryId,
    );
    const directoryPath = dir
      ? await DirectoryService.computePath(dir.entity, ctx.directoryRepository)
      : "/";
    const directorySegments = dir
      ? (
          await DirectoryService.computeSegments(
            dir.entity,
            ctx.directoryRepository,
          )
        ).map((seg) => ({
          id: seg.id as string,
          name: seg.name as string,
        }))
      : [];
    return {
      note: toNoteView(found.entity),
      backlinks: referrers.map((referrer) =>
        toBacklink(referrer, {
          snippet: buildBacklinkSnippet(container.htmlSanitizer, referrer),
        }),
      ),
      directoryPath: directoryPath as string,
      directorySegments,
    };
  });
}
