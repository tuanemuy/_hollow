import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteListOpts } from "@/core/domain/note/ports/noteRepository";
import type { TagId } from "@/core/domain/tag/valueObject";
import { ForbiddenError } from "../errors";
import type { ServiceArgs } from "../types";
import type { NoteListItemDTO } from "./view";
import { toNoteListItem } from "./view";

export type ListNotesInDirectoryInput = Readonly<{
  actorUserId: UserId;
  directoryId: DirectoryId;
  page: number;
  limit: number;
  sort?: "updatedAt" | "createdAt" | "title";
  order?: "asc" | "desc";
}>;

export type ListNotesInDirectoryOutput = Readonly<{
  notes: readonly NoteListItemDTO[];
}>;

export async function listNotesInDirectory({
  container,
  input,
}: ServiceArgs<ListNotesInDirectoryInput>): Promise<ListNotesInDirectoryOutput> {
  const offset = Math.max(0, (input.page - 1) * input.limit);
  const opts: NoteListOpts = {
    limit: input.limit,
    offset,
    ...(input.sort !== undefined ? { sort: input.sort } : {}),
    ...(input.order !== undefined ? { order: input.order } : {}),
  };

  const items = await container.unitOfWorkProvider.run(async (ctx) => {
    const dir = await ctx.directoryRepository.findById(input.directoryId);
    if (!dir) {
      throw new ForbiddenError(
        "DIRECTORY_NOT_FOUND",
        `Directory ${input.directoryId} is not accessible`,
      );
    }
    if (dir.entity.ownerId !== input.actorUserId) {
      throw new ForbiddenError(
        "DIRECTORY_FORBIDDEN",
        `Directory ${input.directoryId} is owned by another user`,
      );
    }
    const found = await ctx.noteRepository.findByDirectory(
      input.directoryId,
      opts,
    );
    const tagIds = new Set<string>();
    for (const note of found) {
      for (const id of note.tagIds) tagIds.add(id);
    }
    const tagMap = new Map<string, string>();
    if (tagIds.size > 0) {
      const tags = await ctx.tagRepository.findByIds(
        [...tagIds].map((id) => id as TagId),
      );
      for (const t of tags) tagMap.set(t.id, t.name);
    }
    return found.map((note) => {
      const excerpt = container.htmlSanitizer
        .toPlainText(note.contentHtml)
        .slice(0, 200);
      const tagNames = note.tagIds
        .map((id) => tagMap.get(id))
        .filter((name): name is string => name !== undefined);
      return toNoteListItem(note, {
        excerpt,
        thumbnailUrl: null,
        tagNames,
        visibility: "private",
      });
    });
  });

  return { notes: items };
}
