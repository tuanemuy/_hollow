import { cache } from "react";
import {
  resolveTagNamesToIds,
  TAG_RESOLVE_LIMIT,
} from "@/components/tag/loaders";
import type { SavedViewDTO } from "@/core/application/dto/view";
import { DirectoryId as DomainDirectoryId } from "@/core/domain/directory/valueObject";
import { NoteId as DomainNoteId } from "@/core/domain/note/valueObject";
import type { PublicationVisibility } from "@/core/domain/publication/valueObject";
import { serverData } from "@/core/presentation/serverAction";
import { flattenDirectoryTree } from "./directoryTree";

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
 */
export type OwnedNoteCommon = Readonly<{
  id: string;
  ownerId: string;
  title: string;
  excerpt: string;
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
 * Search-path note. Since Issue #48, the search usecase fires a
 * secondary `NoteRepository.findByIds` lookup to materialise
 * `directoryId` / `slug` / `updatedAt` from the DB, so the row carries
 * the same fields as `OwnedNoteFilterItem`. The `kind` discriminant on
 * `OwnedNotesResult` is retained to convey the pagination semantics
 * difference (cursor vs page-offset, `nextCursor` only meaningful on
 * search), not the row shape. If a search-only field (score, snippet
 * highlight) ever lands here, this declaration can grow without
 * needing to widen `OwnedNoteFilterItem` in lockstep.
 */
export type OwnedNoteSearchItem = OwnedNoteCommon &
  Readonly<{
    directoryId: string;
    slug: string;
    updatedAt: string;
  }>;

/**
 * Shared display shape across both filter and search paths. The two
 * row types are structurally identical since Issue #48 — this alias
 * lets view components depend on a single name without losing the
 * `kind` discriminant on the surrounding `OwnedNotesResult`.
 */
export type DisplayedNote = OwnedNoteFilterItem | OwnedNoteSearchItem;

/**
 * Result of `loadOwnedNotes`. The discriminated union over `kind`
 * encodes the pagination-semantics difference between the two paths
 * (filter: page/offset, search: cursor-based); the row shape itself is
 * intentionally aligned across both branches since Issue #48.
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
            actorUserId: input.actorUserId,
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
            id: hit.noteId,
            ownerId: hit.ownerId,
            title: hit.title,
            excerpt: hit.snippet,
            tagNames: hit.tagNames,
            visibility: hit.visibility,
            directoryId: hit.directoryId,
            slug: hit.slug,
            updatedAt: hit.updatedAt,
          })),
          // Reflects the post-drop hit count (see `.issue/48/adr.md`
          // ADR-002): rows whose underlying note row vanished between
          // the index hit and the secondary `findByIds` lookup are
          // already absent from `result.hits` by the time we land here.
          count: result.hits.length,
          nextCursor: result.nextCursor,
        };
      }

      // Filter-only path: resolve tag names -> ids when present.
      let tagIds: readonly string[] | undefined;
      if (input.tagNames !== undefined && input.tagNames.length > 0) {
        tagIds = await resolveTagNamesToIds(input.actorUserId, input.tagNames);
      }

      const dateRange = normalizeListDateRange(input.dateRange);

      const visibilityArr = toVisibilityArr(input.visibility);

      // Transport boundary: a malformed `?referencingNoteId=...` (rare —
      // the schema already rejects empty strings) is silently dropped
      // rather than failing the whole loader. `.create()` is used purely
      // to validate the id shape; on success we forward the original
      // string (the usecase re-brands it internally) so the conditional
      // spread below still gates an invalid id out of the filter (ADR-002).
      let referencingNoteId: string | undefined;
      if (
        input.referencingNoteId !== undefined &&
        input.referencingNoteId !== null
      ) {
        try {
          DomainNoteId.create(input.referencingNoteId);
          referencingNoteId = input.referencingNoteId;
        } catch {
          referencingNoteId = undefined;
        }
      }

      // Transport boundary: a malformed `?directoryId=...` is silently
      // dropped rather than failing the whole loader (mirrors the
      // `referencingNoteId` fallback above). Sidebar selection only needs
      // the listing to switch; a bad id falls back to "no directory
      // filter" instead of an error. `.create()` validates only; the
      // original string is forwarded on success (ADR-002).
      let directoryId: string | undefined;
      if (input.directoryId !== undefined && input.directoryId !== null) {
        try {
          DomainDirectoryId.create(input.directoryId);
          directoryId = input.directoryId;
        } catch {
          directoryId = undefined;
        }
      }

      const { notes, count } = await listMod.listNotesByOwner({
        container,
        input: {
          actorUserId: input.actorUserId,
          status: input.status,
          page: input.page,
          limit: input.limit,
          sort: "updatedAt",
          order: "desc",
          ...(tagIds !== undefined ? { tagIds } : {}),
          ...(dateRange !== undefined ? { dateRange } : {}),
          ...(visibilityArr !== undefined ? { visibility: visibilityArr } : {}),
          ...(referencingNoteId !== undefined ? { referencingNoteId } : {}),
          ...(directoryId !== undefined ? { directoryId } : {}),
        },
      });

      return {
        kind: "filter" as const,
        notes: notes.map((n) => ({
          id: n.id,
          ownerId: n.ownerId,
          directoryId: n.directoryId,
          slug: n.slug,
          title: n.title,
          excerpt: n.excerpt,
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
      args: { actorUserId: string; noteId: string },
    ) =>
      getNoteDetail({
        container,
        input: {
          actorUserId: args.actorUserId,
          noteId: args.noteId,
        },
      }),
  ),
);

/**
 * Re-export so existing consumers continue importing `FlatDirectory`
 * from `note/loaders`. The SSOT now lives in `./directoryTree`.
 */
export type { FlatDirectory } from "./directoryTree";

export const loadDirectoryTreeFlat = cache(
  serverData(
    () => import("@/core/application/directory/getDirectoryTree"),
    async (
      { container },
      { getDirectoryTree },
      args: { actorUserId: string },
    ) => {
      const { tree } = await getDirectoryTree({
        container,
        input: { actorUserId: args.actorUserId },
      });
      return { flat: flattenDirectoryTree(tree) };
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
          actorUserId: args.actorUserId,
          limit: TAG_RESOLVE_LIMIT,
        },
      });
      const byName = new Map<string, string>();
      const byId = new Map<string, string>();
      const out = tags.map((t) => {
        const id = t.id;
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
        const match = views.find((v) => v.id === args.viewId);
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
        if (found.entity.ownerId !== args.actorUserId) {
          return { title: null };
        }
        return { title: found.entity.title };
      });
    },
  ),
);

/**
 * Issue #158: paginated revision listing for `/notes/$noteId/history`.
 */
export const loadNoteRevisions = cache(
  serverData(
    () => import("@/core/application/note/listNoteRevisions"),
    (
      { container },
      { listNoteRevisions },
      args: {
        actorUserId: string;
        noteId: string;
        limit: number;
        offset: number;
      },
    ) =>
      listNoteRevisions({
        container,
        input: {
          actorUserId: args.actorUserId,
          noteId: args.noteId,
          limit: args.limit,
          offset: args.offset,
        },
      }),
  ),
);

/** Issue #158: single revision + current note for the history detail page. */
export const loadNoteRevisionDetail = cache(
  serverData(
    () => import("@/core/application/note/getNoteRevision"),
    (
      { container },
      { getNoteRevision },
      args: {
        actorUserId: string;
        noteId: string;
        revisionId: string;
      },
    ) =>
      getNoteRevision({
        container,
        input: {
          actorUserId: args.actorUserId,
          noteId: args.noteId,
          revisionId: args.revisionId,
        },
      }),
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
          actorUserId: args.actorUserId as Parameters<
            typeof listShareLinks
          >[0]["input"]["actorUserId"],
          noteId: args.noteId as Parameters<
            typeof listShareLinks
          >[0]["input"]["noteId"],
        },
      });
      const publication = await container.unitOfWorkProvider.run(
        async ({ publicationStateRepository }) => {
          const found = await publicationStateRepository.findById(
            args.noteId as Parameters<
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
