import { Username } from "@/core/domain/identity/valueObject";
import type { NoteOwnerListOpts } from "@/core/domain/note/ports/noteRepository";
import type { TagId as TagIdVO } from "@/core/domain/tag/valueObject";
import { TagName } from "@/core/domain/tag/valueObject";
import type { NoteListItemDTO } from "../dto/note";
import { NotFoundError } from "../errors";
import { toNoteListItem } from "../note/view";
import type { ServiceArgs } from "../types";

export type ListUserPublicNotesSort = "updatedAt" | "createdAt" | "title";

export type ListUserPublicNotesInput = Readonly<{
  username: string;
  page: number;
  limit: number;
  /**
   * AND-filter: only notes carrying *every* supplied tag name show up.
   * Names that the owner has never used resolve to no tag id, which makes
   * the whole filter match nothing (the owner cannot have a note tagged
   * with a tag that does not exist).
   */
  tagNames?: readonly string[];
  /**
   * Sort axis. Note that the "公開日順" UI label is backed by `updatedAt`
   * here — `listWithCount` sorts on note columns only and has no access to
   * the publication-side `publishedAt`.
   */
  sort?: ListUserPublicNotesSort;
  order?: "asc" | "desc";
}>;

export type ListUserPublicNotesOutput = Readonly<{
  notes: readonly NoteListItemDTO[];
  total: number;
}>;

/**
 * Lists a single user's public notes for the public profile page. The
 * publication state acts as the gate: only notes whose
 * `PublicationState.visibility === 'public'` show up.
 *
 * Backed by `noteRepository.listWithCount({ visibility: ['public'], … })`:
 * the page `items` and the filtered `total` come from a single filter
 * resolution so `items.length <= total` holds structurally and the rendered
 * count cannot disagree with the visible slice. Tag / sort filters are
 * applied on the same pass.
 */
export async function listUserPublicNotes({
  container,
  input,
}: ServiceArgs<ListUserPublicNotesInput>): Promise<ListUserPublicNotesOutput> {
  const username = Username.create(input.username);
  return container.unitOfWorkProvider.run(
    async ({ userRepository, noteRepository, tagRepository }) => {
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

      // Resolve requested tag names to ids. A name the owner has never used
      // has no row, so the AND-filter can never match — short-circuit to an
      // empty page rather than dropping the unmatched name silently.
      let tagIds: readonly TagIdVO[] | undefined;
      if (input.tagNames !== undefined && input.tagNames.length > 0) {
        const resolved = await Promise.all(
          input.tagNames.map((raw) =>
            tagRepository.findByOwnerAndName(user.id, TagName.create(raw)),
          ),
        );
        if (resolved.some((tag) => tag === null)) {
          return { notes: [], total: 0 };
        }
        tagIds = resolved.map((tag) => (tag as NonNullable<typeof tag>).id);
      }

      const offset = Math.max(0, (input.page - 1) * input.limit);
      const opts: NoteOwnerListOpts = {
        visibility: ["public"],
        status: "active",
        ...(tagIds !== undefined ? { tagIds } : {}),
        sort: input.sort ?? "updatedAt",
        order: input.order ?? "desc",
        limit: input.limit,
        offset,
      };
      const { items: liveNotes, count } = await noteRepository.listWithCount(
        user.id,
        opts,
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

      return { notes: items, total: count };
    },
  );
}
