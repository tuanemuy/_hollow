import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteOwnerListOpts } from "@/core/domain/note/ports/noteRepository";
import type { DateRange, NoteStatus } from "@/core/domain/note/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import type { ServiceArgs } from "../types";
import type { NoteListItemDTO } from "./view";
import { toNoteListItem } from "./view";

export type ListNotesByOwnerInput = Readonly<{
  actorUserId: UserId;
  status?: NoteStatus;
  tagIds?: readonly TagId[];
  dateRange?: DateRange;
  page: number;
  limit: number;
  sort?: "updatedAt" | "createdAt" | "title";
  order?: "asc" | "desc";
}>;

export type ListNotesByOwnerOutput = Readonly<{
  notes: readonly NoteListItemDTO[];
  count: number;
}>;

export async function listNotesByOwner({
  container,
  input,
}: ServiceArgs<ListNotesByOwnerInput>): Promise<ListNotesByOwnerOutput> {
  const offset = Math.max(0, (input.page - 1) * input.limit);
  const opts: NoteOwnerListOpts = {
    limit: input.limit,
    offset,
    ...(input.sort !== undefined ? { sort: input.sort } : {}),
    ...(input.order !== undefined ? { order: input.order } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.tagIds !== undefined ? { tagIds: input.tagIds } : {}),
    ...(input.dateRange !== undefined ? { dateRange: input.dateRange } : {}),
  };

  const { items, count } = await container.unitOfWorkProvider.run(
    async (ctx) => {
      const found = await ctx.noteRepository.findByOwner(
        input.actorUserId,
        opts,
      );
      const total = await ctx.noteRepository.countByOwner(input.actorUserId);
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
      const items = found.map((note) => {
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
          // Listing payload defaults to `private` — the publication
          // projection that flips this to `public` / `unlisted` runs as a
          // separate join when the caller needs it.
          visibility: "private",
        });
      });
      return { items, count: total };
    },
  );

  return { notes: items, count };
}
