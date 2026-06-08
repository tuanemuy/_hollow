import type { UserId } from "@/core/domain/identity/valueObject";
import { Username } from "@/core/domain/identity/valueObject";
import type { Note } from "@/core/domain/note/entity";
import type {
  NoteOwnerListOpts,
  NoteRepository,
} from "@/core/domain/note/ports/noteRepository";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { PublicationStateRepository } from "@/core/domain/publication/ports/publicationStateRepository";
import type { TagId as TagIdVO } from "@/core/domain/tag/valueObject";
import { TagName } from "@/core/domain/tag/valueObject";
import type { NoteListItemDTO } from "../dto/note";
import { NotFoundError } from "../errors";
import { toNoteListItem } from "../note/view";
import type { ServiceArgs } from "../types";

export type ListUserPublicNotesSort =
  | "publishedAt"
  | "updatedAt"
  | "createdAt"
  | "title";

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
   * Sort axis. `publishedAt` (the default, UI「公開日順」) sorts on the
   * publication aggregate's `published_at` via
   * `publicationStateRepository.listPublicNoteIdsByOwnerSorted`; the other
   * axes (`updatedAt`/`createdAt`/`title`) sort on note columns via
   * `noteRepository.listWithCount`.
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
 * Two read paths by sort axis:
 * - `publishedAt` (default, UI「公開日順」): the page ids and the filtered
 *   `total` come from `publicationStateRepository.listPublicNoteIdsByOwnerSorted`
 *   on the publication aggregate, so the "公開日順" ordering is backed by the
 *   real `published_at` rather than a note column. Tag AND-filters are
 *   resolved to ids in the application layer and passed as the candidate set
 *   so the order and the count come from a single pass.
 * - `updatedAt` / `createdAt` / `title`: backed by
 *   `noteRepository.listWithCount({ visibility: ['public'], … })`, which sorts
 *   on note columns.
 *
 * Either way the page `items` and `total` come from a single filter
 * resolution so `items.length <= total` holds structurally and the rendered
 * count cannot disagree with the visible slice.
 */
export async function listUserPublicNotes({
  container,
  input,
}: ServiceArgs<ListUserPublicNotesInput>): Promise<ListUserPublicNotesOutput> {
  const username = Username.create(input.username);
  return container.unitOfWorkProvider.run(
    async ({
      userRepository,
      noteRepository,
      tagRepository,
      publicationStateRepository,
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

      const sort = input.sort ?? "publishedAt";
      const order = input.order ?? "desc";
      const offset = Math.max(0, (input.page - 1) * input.limit);

      const { liveNotes, total } =
        sort === "publishedAt"
          ? await listByPublishedAt({
              ownerId: user.id,
              tagIds,
              order,
              limit: input.limit,
              offset,
              noteRepository,
              publicationStateRepository,
            })
          : await listByNoteColumn({
              ownerId: user.id,
              tagIds,
              sort,
              order,
              limit: input.limit,
              offset,
              noteRepository,
            });

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

      return { notes: items, total };
    },
  );
}

type ListResult = Readonly<{ liveNotes: readonly Note[]; total: number }>;

// `publishedAt` path: publication aggregate owns the ordering. The port
// returns ids in `published_at` order; `findByIds` does not preserve input
// order (parallel chunk reads), so re-index by id and re-order to keep the
// 公開日順 (mirrors `listRelatedPublicNotes`). Trashed/missing notes are
// already excluded by the adapter's `active` JOIN, but a defensive filter
// keeps the projection total against rare relay-lag rows.
// Upper bound on tag-candidate ids resolved before the publication
// intersection. Far above any realistic single-owner public-note count;
// the publication listing then re-pages within the candidate set.
const TAG_CANDIDATE_CAP = 1000;

async function listByPublishedAt(args: {
  ownerId: UserId;
  tagIds: readonly TagIdVO[] | undefined;
  order: "asc" | "desc";
  limit: number;
  offset: number;
  noteRepository: NoteRepository;
  publicationStateRepository: PublicationStateRepository;
}): Promise<ListResult> {
  // Resolve the tag AND-filter to candidate note ids so the publication
  // listing can intersect (`note_id IN (...)`) and order in one pass. The
  // candidate resolution is a plain owner+tag+active lookup; the publication
  // listing then applies the public / published_at gate and the ordering.
  let candidateIds: readonly NoteId[] | undefined;
  if (args.tagIds !== undefined) {
    const tagged = await args.noteRepository.findByOwner(args.ownerId, {
      status: "active",
      tagIds: args.tagIds,
      limit: TAG_CANDIDATE_CAP,
      offset: 0,
    });
    if (tagged.length === 0) {
      return { liveNotes: [], total: 0 };
    }
    candidateIds = tagged.map((n) => n.id);
  }

  const { noteIds, total } =
    await args.publicationStateRepository.listPublicNoteIdsByOwnerSorted(
      args.ownerId,
      {
        order: args.order,
        limit: args.limit,
        offset: args.offset,
        ...(candidateIds !== undefined ? { noteIds: candidateIds } : {}),
      },
    );

  if (noteIds.length === 0) {
    return { liveNotes: [], total };
  }

  const fetched = await args.noteRepository.findByIds(noteIds);
  const byId = new Map<string, Note>(
    fetched
      .filter((n) => n.status === "active")
      .map((n) => [n.id as string, n]),
  );
  const liveNotes = noteIds
    .map((id) => byId.get(id as string))
    .filter((n): n is Note => n !== undefined);

  return { liveNotes, total };
}

// `updatedAt` / `createdAt` / `title` path: note columns own the ordering,
// so `listWithCount` resolves the page and the filtered count in one pass.
async function listByNoteColumn(args: {
  ownerId: UserId;
  tagIds: readonly TagIdVO[] | undefined;
  sort: "updatedAt" | "createdAt" | "title";
  order: "asc" | "desc";
  limit: number;
  offset: number;
  noteRepository: NoteRepository;
}): Promise<ListResult> {
  const opts: NoteOwnerListOpts = {
    visibility: ["public"],
    status: "active",
    ...(args.tagIds !== undefined ? { tagIds: args.tagIds } : {}),
    sort: args.sort,
    order: args.order,
    limit: args.limit,
    offset: args.offset,
  };
  const { items, count } = await args.noteRepository.listWithCount(
    args.ownerId,
    opts,
  );
  return { liveNotes: items, total: count };
}
