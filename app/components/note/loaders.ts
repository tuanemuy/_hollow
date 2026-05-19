import { cache } from "react";
import {
  resolveTagNamesToIds,
  TAG_RESOLVE_LIMIT,
} from "@/components/tag/loaders";
import type { NoteId } from "@/core/application/dto/note";
import type { SavedViewDTO } from "@/core/application/dto/view";
import type { UserId as DomainUserId } from "@/core/domain/identity/valueObject";
import { NoteId as DomainNoteId } from "@/core/domain/note/valueObject";
import type { PublicationVisibility } from "@/core/domain/publication/valueObject";
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
  referencingNoteId?: string | null;
  dateRange?: Readonly<{ from?: string | null; to?: string | null }> | null;
}>;

/**
 * Fields shared by both filter and search modes of `OwnedNotesResult`.
 *
 * `thumbnailUrl` is always `null` on the search path today, but it lives
 * in the common shape so a future search-index extension that surfaces
 * the thumbnail can drop into place without churning consumers.
 */
export type OwnedNoteCommon = Readonly<{
  id: string;
  ownerId: string;
  title: string;
  excerpt: string;
  thumbnailUrl: string | null;
  tagNames: readonly string[];
  visibility: "private" | "unlisted" | "public";
}>;

/** Filter-path note: carries directory / slug / updatedAt projections. */
export type OwnedNoteFilterItem = OwnedNoteCommon &
  Readonly<{
    directoryId: string;
    slug: string;
    updatedAt: string;
  }>;

/**
 * Search-path note: the search index does not project `directoryId` /
 * `slug` / `updatedAt`, so these fields are intentionally absent in the
 * type. Consumers that need them must narrow on `kind === "filter"`.
 */
export type OwnedNoteSearchItem = OwnedNoteCommon;

/**
 * Result of `loadOwnedNotes`. A discriminated union over `kind` makes
 * the search-path's missing projections (directoryId / slug / updatedAt)
 * a type-level fact instead of a sentinel-value gotcha — see Issue #13
 * ADR-003.
 */
export type OwnedNotesResult =
  | Readonly<{
      kind: "filter";
      notes: readonly OwnedNoteFilterItem[];
      count: number;
      /** Filter-only path: pagination is page/offset based; cursor is unused. */
      nextCursor: string | null;
    }>
  | Readonly<{
      kind: "search";
      notes: readonly OwnedNoteSearchItem[];
      count: number;
      /** Search path: cursor for follow-up `searchOwnNotes` pages. */
      nextCursor: string | null;
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

/**
 * URL exposes visibility as a single enum; both the list and search
 * usecase ports accept an array to leave room for a future multi-select
 * without breaking the application boundary. Build the array exactly
 * once so the two paths cannot drift.
 */
function toVisibilityArr(
  v: OwnedNotesQuery["visibility"],
): readonly PublicationVisibility[] | undefined {
  if (v === undefined || v === null) return undefined;
  return [v];
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
      ]),
    async (
      { container },
      [listMod, searchMod],
      input: OwnedNotesQuery,
    ): Promise<OwnedNotesResult> => {
      const keyword = input.q?.trim() ?? "";

      if (keyword.length > 0) {
        const visibilityArr = toVisibilityArr(input.visibility);
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
            ...(visibilityArr !== undefined
              ? { visibility: visibilityArr }
              : {}),
            limit: input.limit,
            cursor: null,
          },
        });
        return {
          kind: "search" as const,
          notes: result.hits.map((hit) => ({
            id: hit.noteId as unknown as string,
            ownerId: hit.ownerId as unknown as string,
            title: hit.title as unknown as string,
            excerpt: hit.snippet as unknown as string,
            thumbnailUrl: null,
            tagNames: hit.tagNames,
            visibility: hit.visibility,
          })),
          count: result.hits.length,
          nextCursor: result.nextCursor,
        };
      }

      // Filter-only path: resolve tag names -> ids when present.
      let tagIds: readonly TagId[] | undefined;
      if (input.tagNames !== undefined && input.tagNames.length > 0) {
        const resolved = await resolveTagNamesToIds(
          input.actorUserId,
          input.tagNames,
        );
        tagIds = resolved.map((id) => id as unknown as TagId);
      }

      const dateRange = normalizeListDateRange(input.dateRange);

      const visibilityArr = toVisibilityArr(input.visibility);

      // Transport boundary: a malformed `?referencingNoteId=...` (rare —
      // the schema already rejects empty strings) is silently dropped
      // rather than failing the whole loader.
      let referencingNoteId: DomainNoteId | undefined;
      if (
        input.referencingNoteId !== undefined &&
        input.referencingNoteId !== null
      ) {
        try {
          referencingNoteId = DomainNoteId.create(input.referencingNoteId);
        } catch {
          referencingNoteId = undefined;
        }
      }

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
          ...(visibilityArr !== undefined ? { visibility: visibilityArr } : {}),
          ...(referencingNoteId !== undefined ? { referencingNoteId } : {}),
        },
      });

      return {
        kind: "filter" as const,
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
          limit: TAG_RESOLVE_LIMIT,
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

/**
 * Resolve the title of a note referenced by `?referencingNoteId=<id>`
 * so the FilterBar chip can display it instead of a UUID fragment.
 *
 * Failure modes (malformed id / not found / owner mismatch / empty
 * title) all collapse to `{ title: null }` so the caller falls back
 * to the existing UUID-prefix label. Driver-level errors from
 * `findById` are intentionally not caught: they collapse the parent
 * `Promise.all` together with the listing load, keeping the home
 * page's error response coherent rather than silently showing a
 * UUID-fragment chip on top of a 500 listing.
 */
export const loadReferencingNoteTitle = cache(
  serverData(
    () => Promise.resolve({}),
    async (
      { container },
      _mod,
      args: { actorUserId: string; noteId: string },
    ): Promise<{ title: string | null }> => {
      let noteId: DomainNoteId;
      try {
        noteId = DomainNoteId.create(args.noteId);
      } catch {
        return { title: null };
      }
      return container.unitOfWorkProvider.run(async ({ noteRepository }) => {
        const found = await noteRepository.findById(noteId);
        if (found === null) return { title: null };
        if ((found.entity.ownerId as unknown as string) !== args.actorUserId) {
          return { title: null };
        }
        return { title: found.entity.title };
      });
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
