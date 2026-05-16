import { cache } from "react";
import type { NoteId } from "@/core/application/dto/note";
import type { SavedViewDTO } from "@/core/application/dto/view";
import type { UserId as DomainUserId } from "@/core/domain/identity/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { serverData } from "@/core/presentation/serverAction";

/**
 * Combined input for the home / note-list loader.
 *
 * The loader switches between `listNotesByOwner` (filter-only) and
 * `searchOwnNotes` (keyword-driven) on whether `q` is non-empty.
 *
 * Tags are passed by **name** (matching the URL representation). For
 * the filter-only path we resolve them to ids via `listTags`; for the
 * search path the index already filters by name so no resolution is
 * needed.
 */
export type OwnedNotesQuery = Readonly<{
  actorUserId: string;
  status: "active" | "trashed";
  page: number;
  limit: number;
  tagNames?: readonly string[];
  directoryId?: string | null;
  q?: string | null;
  visibility?: "private" | "unlisted" | "public" | null;
  dateRange?: Readonly<{ from?: string | null; to?: string | null }> | null;
}>;

export type OwnedNotesResult = Readonly<{
  notes: ReadonlyArray<{
    id: string;
    ownerId: string;
    directoryId: string;
    slug: string;
    title: string;
    excerpt: string;
    thumbnailUrl: string | null;
    tagNames: readonly string[];
    updatedAt: string;
    visibility: "private" | "unlisted" | "public";
  }>;
  count: number;
  /** `null` for the filter-only path; populated for the search path. */
  nextCursor: string | null;
  mode: "filter" | "search";
}>;

/**
 * Both ends of the `[from, to]` window are required by the search
 * usecase. The home filter UI lets the user leave one end open, so we
 * clamp missing bounds to the widest practical interval.
 */
function normalizeSearchDateRange(
  raw: OwnedNotesQuery["dateRange"],
): { from: Date; to: Date } | null {
  if (raw === undefined || raw === null) return null;
  const from = raw.from === null || raw.from === undefined ? null : raw.from;
  const to = raw.to === null || raw.to === undefined ? null : raw.to;
  if (from === null && to === null) return null;
  return {
    from: from === null ? new Date(0) : new Date(from),
    to: to === null ? new Date() : new Date(to),
  };
}

function normalizeListDateRange(
  raw: OwnedNotesQuery["dateRange"],
): { from: Date | null; to: Date | null } | undefined {
  if (raw === undefined || raw === null) return undefined;
  const from = raw.from === null || raw.from === undefined ? null : raw.from;
  const to = raw.to === null || raw.to === undefined ? null : raw.to;
  if (from === null && to === null) return undefined;
  return {
    from: from === null ? null : new Date(from),
    to: to === null ? null : new Date(to),
  };
}

export const loadOwnedNotes = cache(
  serverData(
    () =>
      Promise.all([
        import("@/core/application/note/listNotesByOwner"),
        import("@/core/application/search/searchOwnNotes"),
        import("@/core/application/tag/listTags"),
      ]),
    async (
      { container },
      [listMod, searchMod, tagsMod],
      input: OwnedNotesQuery,
    ): Promise<OwnedNotesResult> => {
      const keyword = input.q?.trim() ?? "";

      if (keyword.length > 0) {
        const result = await searchMod.searchOwnNotes({
          container,
          input: {
            actorUserId: input.actorUserId as unknown as DomainUserId,
            keyword,
            ...(input.tagNames !== undefined
              ? { tagNames: input.tagNames }
              : {}),
            directoryId: input.directoryId ?? null,
            dateRange: normalizeSearchDateRange(input.dateRange),
            limit: input.limit,
            cursor: null,
          },
        });
        return {
          notes: result.hits.map((hit) => ({
            id: hit.noteId as unknown as string,
            ownerId: hit.ownerId as unknown as string,
            directoryId: "" as string,
            slug: "",
            title: hit.title as unknown as string,
            excerpt: hit.snippet as unknown as string,
            thumbnailUrl: null,
            tagNames: hit.tagNames,
            updatedAt: new Date(0).toISOString(),
            visibility: "private" as const,
          })),
          count: result.hits.length,
          nextCursor: result.nextCursor,
          mode: "search" as const,
        };
      }

      // Filter-only path: resolve tag names -> ids when present.
      let tagIds: readonly TagId[] | undefined;
      if (input.tagNames !== undefined && input.tagNames.length > 0) {
        const { tags } = await tagsMod.listTags({
          container,
          input: {
            actorUserId: input.actorUserId as unknown as Parameters<
              typeof tagsMod.listTags
            >[0]["input"]["actorUserId"],
            limit: 200,
          },
        });
        const byName = new Map<string, string>();
        for (const tag of tags) {
          byName.set(tag.name, tag.id as unknown as string);
        }
        tagIds = input.tagNames
          .map((name) => byName.get(name))
          .filter((id): id is string => id !== undefined)
          .map((id) => id as unknown as TagId);
      }

      const dateRange = normalizeListDateRange(input.dateRange);
      const { notes, count } = await listMod.listNotesByOwner({
        container,
        input: {
          actorUserId: input.actorUserId as unknown as DomainUserId,
          status: input.status,
          page: input.page,
          limit: input.limit,
          sort: "updatedAt",
          order: "desc",
          ...(tagIds !== undefined ? { tagIds } : {}),
          ...(dateRange !== undefined ? { dateRange } : {}),
        },
      });

      return {
        notes: notes.map((n) => ({
          id: n.id as unknown as string,
          ownerId: n.ownerId as unknown as string,
          directoryId: n.directoryId as unknown as string,
          slug: n.slug,
          title: n.title,
          excerpt: n.excerpt,
          thumbnailUrl: n.thumbnailUrl,
          tagNames: n.tagNames,
          updatedAt: n.updatedAt,
          visibility: n.visibility,
        })),
        count,
        nextCursor: null,
        mode: "filter" as const,
      };
    },
  ),
);

export const loadNoteDetail = cache(
  serverData(
    () => import("@/core/application/note/getNoteDetail"),
    (
      { container },
      { getNoteDetail },
      args: { actorUserId: string; noteId: NoteId },
    ) =>
      getNoteDetail({
        container,
        input: {
          actorUserId: args.actorUserId as unknown as Parameters<
            typeof getNoteDetail
          >[0]["input"]["actorUserId"],
          noteId: args.noteId as unknown as Parameters<
            typeof getNoteDetail
          >[0]["input"]["noteId"],
        },
      }),
  ),
);

/**
 * Flatten the per-owner directory tree into a depth-prefixed list, the
 * shape that `<select>` pickers want.
 */
export type FlatDirectory = Readonly<{
  id: string;
  parentId: string | null;
  name: string;
  depth: number;
  path: string;
}>;

export const loadDirectoryTreeFlat = cache(
  serverData(
    () => import("@/core/application/directory/getDirectoryTree"),
    async (
      { container },
      { getDirectoryTree },
      args: { actorUserId: string },
    ): Promise<{ flat: readonly FlatDirectory[] }> => {
      const { tree } = await getDirectoryTree({
        container,
        input: { actorUserId: args.actorUserId },
      });
      const flat: FlatDirectory[] = [];
      type Node = (typeof tree)[number];
      const walk = (node: Node, parentPath: string): void => {
        const path = `${parentPath}/${node.name}`;
        flat.push({
          id: node.id as unknown as string,
          parentId:
            node.parentId === null
              ? null
              : (node.parentId as unknown as string),
          name: node.name,
          depth: node.depth,
          path,
        });
        for (const child of node.children) walk(child, path);
      };
      for (const root of tree) walk(root, "");
      return { flat };
    },
  ),
);

export const loadAllTags = cache(
  serverData(
    () => import("@/core/application/tag/listTags"),
    async (
      { container },
      { listTags },
      args: { actorUserId: string },
    ): Promise<{
      tags: ReadonlyArray<{ id: string; name: string; noteCount: number }>;
      byName: ReadonlyMap<string, string>;
      byId: ReadonlyMap<string, string>;
    }> => {
      const { tags } = await listTags({
        container,
        input: {
          actorUserId: args.actorUserId as unknown as Parameters<
            typeof listTags
          >[0]["input"]["actorUserId"],
          limit: 200,
        },
      });
      const byName = new Map<string, string>();
      const byId = new Map<string, string>();
      const out = tags.map((t) => {
        const id = t.id as unknown as string;
        byName.set(t.name, id);
        byId.set(id, t.name);
        return { id, name: t.name, noteCount: t.noteCount };
      });
      return { tags: out, byName, byId };
    },
  ),
);

export const loadSavedViewsByKind = cache(
  serverData(
    () => import("@/core/application/view/listSavedViews"),
    (
      { container },
      { listSavedViews },
      args: { actorUserId: string; kind: "personal" | "public" },
    ) =>
      listSavedViews({
        container,
        input: { actorUserId: args.actorUserId, kind: args.kind },
      }),
  ),
);

/**
 * Load a single SavedView by id for the `?viewId=...` URL-restore path.
 *
 * `listSavedViews` is used as the source of truth here because there is
 * no per-id read usecase exposed at the application layer yet. The
 * caller filters the result; with the per-user list size capped this
 * remains a single query per page render.
 */
export const loadSavedViewById = cache(
  serverData(
    () => import("@/core/application/view/listSavedViews"),
    async (
      { container },
      { listSavedViews },
      args: { actorUserId: string; viewId: string },
    ): Promise<{ view: SavedViewDTO | null }> => {
      for (const kind of ["personal", "public"] as const) {
        const { views } = await listSavedViews({
          container,
          input: { actorUserId: args.actorUserId, kind },
        });
        const match = views.find(
          (v) => (v.id as unknown as string) === args.viewId,
        );
        if (match !== undefined) return { view: match };
      }
      return { view: null };
    },
  ),
);

export const loadPublishStateForNote = cache(
  serverData(
    () => import("@/core/application/publication/listShareLinks"),
    async (
      { container },
      { listShareLinks },
      args: { actorUserId: string; noteId: string },
    ) => {
      const { links } = await listShareLinks({
        container,
        input: {
          actorUserId: args.actorUserId as unknown as Parameters<
            typeof listShareLinks
          >[0]["input"]["actorUserId"],
          noteId: args.noteId as unknown as Parameters<
            typeof listShareLinks
          >[0]["input"]["noteId"],
        },
      });
      const publication = await container.unitOfWorkProvider.run(
        async ({ publicationStateRepository }) => {
          const found = await publicationStateRepository.findById(
            args.noteId as unknown as Parameters<
              typeof publicationStateRepository.findById
            >[0],
          );
          if (found === null) return null;
          return found.entity;
        },
      );
      return {
        visibility: publication === null ? "private" : publication.visibility,
        publishedAt:
          publication === null || publication.publishedAt === null
            ? null
            : publication.publishedAt.toISOString(),
        links,
      };
    },
  ),
);
