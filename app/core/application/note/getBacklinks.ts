import { DirectoryService } from "@/core/domain/directory/service";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import type { BacklinkDTO } from "./view";
import { buildBacklinkSnippet, toBacklink } from "./view";

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
    // Unbounded referrer list: resolve all directory paths from one tree
    // read (`O(1)` queries) rather than one `findAncestors` per referrer.
    const referrerSegmentsByDir = await DirectoryService.computeSegmentsForMany(
      found.entity.ownerId,
      referrers.map((r) => r.directoryId as DirectoryId),
      ctx.directoryRepository,
    );
    return {
      backlinks: referrers.map((referrer) =>
        toBacklink(referrer, {
          snippet: buildBacklinkSnippet(container.htmlSanitizer, referrer),
          directorySegments: (
            referrerSegmentsByDir.get(referrer.directoryId as DirectoryId) ?? []
          ).map((seg) => ({ id: seg.id as string, name: seg.name as string })),
        }),
      ),
    };
  });
}
