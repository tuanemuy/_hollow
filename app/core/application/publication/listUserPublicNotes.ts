import { Username } from "@/core/domain/identity/valueObject";
import type { NoteId as NoteIdVO } from "@/core/domain/note/valueObject";
import type { TagId as TagIdVO } from "@/core/domain/tag/valueObject";
import type { NoteListItemDTO } from "../dto/note";
import { NotFoundError } from "../errors";
import { toNoteListItem } from "../note/view";
import type { ServiceArgs } from "../types";

export type ListUserPublicNotesInput = Readonly<{
  username: string;
  page: number;
  limit: number;
}>;

export type ListUserPublicNotesOutput = Readonly<{
  notes: readonly NoteListItemDTO[];
  total: number;
}>;

/**
 * Lists a single user's public notes for the public profile page. The
 * publication state acts as the gate: only notes whose
 * `PublicationState.visibility === 'public'` show up. The note rows are
 * sliced into a page locally because `PublicationStateRepository`
 * exposes simple bounded listing — pagination is offset/limit-style to
 * match the rest of the listing surface.
 */
export async function listUserPublicNotes({
  container,
  input,
}: ServiceArgs<ListUserPublicNotesInput>): Promise<ListUserPublicNotesOutput> {
  const username = Username.create(input.username);
  return container.unitOfWorkProvider.run(
    async ({
      userRepository,
      publicationStateRepository,
      noteRepository,
      tagRepository,
    }) => {
      const user = await userRepository.findByUsername(username);
      if (user === null) {
        throw new NotFoundError("user", `User not found: ${input.username}`);
      }
      if (user.status === "deleted" || user.status === "suspended") {
        throw new NotFoundError(
          "user",
          `User not available: ${input.username}`,
        );
      }
      const publicNoteIds = await publicationStateRepository.findPublicByOwner(
        user.id,
        { limit: 1000 },
      );
      const offset = Math.max(0, (input.page - 1) * input.limit);
      const sliced = publicNoteIds.slice(offset, offset + input.limit);

      const notes = await Promise.all(
        sliced.map((id) => noteRepository.findById(id as NoteIdVO)),
      );
      const liveNotes = notes
        .map((v) => v?.entity ?? null)
        .filter(
          (note): note is NonNullable<typeof note> =>
            note !== null && note.status === "active",
        );

      const allTagIds = new Set<string>();
      for (const note of liveNotes) {
        for (const id of note.tagIds) allTagIds.add(id);
      }
      const tagMap = new Map<string, string>();
      if (allTagIds.size > 0) {
        const tags = await tagRepository.findByIds(
          [...allTagIds].map((id) => id as TagIdVO),
        );
        for (const t of tags) tagMap.set(t.id, t.name as string);
      }

      const items = liveNotes.map((note) => {
        const excerpt = container.htmlSanitizer
          .toPlainText(note.contentHtml)
          .slice(0, 200);
        const tagNames = note.tagIds
          .map((id) => tagMap.get(id))
          .filter((name): name is string => name !== undefined);
        return toNoteListItem(note, {
          excerpt,
          tagNames,
          visibility: "public",
        });
      });

      return { notes: items, total: publicNoteIds.length };
    },
  );
}
