import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import type { BacklinkDTO } from "./view";
import { toBacklink } from "./view";

export type GetBacklinksInput = Readonly<{
  actorUserId: UserId;
  noteId: NoteId;
}>;

export type GetBacklinksOutput = Readonly<{
  backlinks: readonly BacklinkDTO[];
}>;

export async function getBacklinks({
  container,
  input,
}: ServiceArgs<GetBacklinksInput>): Promise<GetBacklinksOutput> {
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
    return {
      backlinks: referrers.map((referrer) => {
        const snippet = container.htmlSanitizer
          .toPlainText(referrer.contentHtml)
          .slice(0, 200);
        return toBacklink(referrer, {
          snippet: snippet.length > 0 ? snippet : null,
        });
      }),
    };
  });
}
