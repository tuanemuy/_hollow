import { Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import { BulkActionBar } from "./list/BulkActionBar";
import { FilterBar } from "./list/FilterBar";
import { hasAnyHomeFilter, homeSectionResetKey } from "./list/listSelectors";
import { NoteListToolbar } from "./list/NoteListToolbar";
import { NoteListViews } from "./list/NoteListViews";
import { SelectionProvider } from "./list/SelectionContext";
import {
  FilterBarSkeleton,
  NoteListSkeleton,
  ToolbarSkeleton,
} from "./list/skeletons";
import { ViewSwitcher } from "./list/ViewSwitcher";
import {
  loadAllTags,
  loadDirectoryTreeFlat,
  loadOwnedNotes,
  loadReferencingNoteTitle,
  loadSavedViewsByKind,
  type OwnedNotesQuery,
} from "./loaders";
import type { NoteListSearch } from "./schema";

type Props = {
  userId: string;
  page: number;
  limit: number;
  search: NoteListSearch;
};

/**
 * Home page composition. Each data-dependent section is an async server
 * component inside its own `<Suspense>` + `SectionErrorBoundary`, so one
 * slow / failing loader no longer blocks or breaks the whole page.
 * Sections await the `cache(serverData(...))` loaders directly —
 * same-render dedup keeps shared data (tree, tags, owned notes) at one
 * fetch.
 *
 * Boundary granularity (#649, `.issue/649/adr.md` ADR-002): the heading
 * (`ViewSwitcher`, needs saved views) + page-meta row (count + toolbar
 * actions) form one boundary; the filter bar (tags + tree + referencing
 * title) is another; the note listing is its own. The heading boundary and
 * the listing both await `loadOwnedNotes` — React `cache` keys by argument
 * *reference identity*, so the query object is built exactly once here and
 * the same reference is passed to both sections (a structurally-equal
 * literal per section would double the query).
 */
export function HomePage({ userId, page, limit, search }: Props) {
  const hasAnyFilter = hasAnyHomeFilter(search);
  // Clears sticky section errors when navigation changes loader inputs.
  const resetKey = homeSectionResetKey(search);

  const notesQuery: OwnedNotesQuery = {
    actorUserId: userId,
    status: "active",
    page,
    limit,
    ...(search.directoryId !== undefined
      ? { directoryId: search.directoryId }
      : {}),
    ...(search.q !== undefined ? { q: search.q } : {}),
    ...(search.tagNames !== undefined ? { tagNames: search.tagNames } : {}),
    ...(search.visibility !== undefined
      ? { visibility: search.visibility }
      : {}),
    ...(search.referencingNoteId !== undefined
      ? { referencingNoteId: search.referencingNoteId }
      : {}),
    ...(search.from !== undefined || search.to !== undefined
      ? {
          dateRange: {
            from: search.from ?? null,
            to: search.to ?? null,
          },
        }
      : {}),
  };

  return (
    <SelectionProvider>
      <SectionErrorBoundary section="ツールバー" resetKey={resetKey}>
        <Suspense fallback={<ToolbarSkeleton />}>
          <HeaderSection
            userId={userId}
            search={search}
            notesQuery={notesQuery}
            hasAnyFilter={hasAnyFilter || search.q !== undefined}
          />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary section="フィルタ" resetKey={resetKey}>
        <Suspense fallback={<FilterBarSkeleton />}>
          <FilterSection userId={userId} search={search} />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary section="ノート一覧" resetKey={resetKey}>
        <Suspense fallback={<NoteListSkeleton />}>
          <NotesSection notesQuery={notesQuery} />
        </Suspense>
      </SectionErrorBoundary>
    </SelectionProvider>
  );
}

/**
 * Heading (view-switcher trigger) + page-meta row: left = note count,
 * right = toolbar action group (#626 ADR-004/007). `notesQuery` must be the
 * same object reference `NotesSection` receives (see `HomePage` JSDoc).
 */
async function HeaderSection({
  userId,
  search,
  notesQuery,
  hasAnyFilter,
}: Readonly<{
  userId: string;
  search: NoteListSearch;
  notesQuery: OwnedNotesQuery;
  hasAnyFilter: boolean;
}>) {
  const [{ views }, owned] = await Promise.all([
    loadSavedViewsByKind({
      actorUserId: userId,
      kind: "personal",
    }),
    loadOwnedNotes(notesQuery),
  ]);
  return (
    <>
      <ViewSwitcher search={search} savedViews={views} />
      <div className="flex justify-between items-center flex-wrap gap-x-3 gap-y-2 mb-5">
        <p className="text-md text-ink-secondary">{owned.count} 件のノート</p>
        <NoteListToolbar search={search} hasAnyFilter={hasAnyFilter} />
      </div>
    </>
  );
}

async function FilterSection({
  userId,
  search,
}: Readonly<{ userId: string; search: NoteListSearch }>) {
  const [{ tags }, { flat }, referencing] = await Promise.all([
    loadAllTags({ actorUserId: userId }),
    loadDirectoryTreeFlat({ actorUserId: userId }),
    search.referencingNoteId !== undefined
      ? loadReferencingNoteTitle({
          actorUserId: userId,
          noteId: search.referencingNoteId,
        })
      : Promise.resolve({ title: null as string | null }),
  ]);

  // Resolve the selected directory's display name from the already-loaded
  // tree (no extra I/O). An id not present in the tree (e.g. just deleted)
  // leaves this undefined; FilterBar falls back to a generic label.
  const directoryName =
    search.directoryId === undefined
      ? undefined
      : flat.find((d) => d.id === search.directoryId)?.name;

  return (
    <>
      <FilterBar
        tags={tags}
        selectedTagNames={search.tagNames ?? []}
        from={search.from}
        to={search.to}
        visibility={search.visibility}
        directoryId={search.directoryId}
        {...(directoryName !== undefined ? { directoryName } : {})}
        referencingNoteId={search.referencingNoteId}
        referencingNoteTitle={referencing.title}
      />
      {/* BulkActionBar only needs the tree, so it lives in the boundary
          that already awaits it (same-render dedup). */}
      <BulkActionBar tree={flat} />
    </>
  );
}

async function NotesSection({
  notesQuery,
}: Readonly<{ notesQuery: OwnedNotesQuery }>) {
  const owned = await loadOwnedNotes(notesQuery);

  return owned.notes.length === 0 ? (
    <div className="mt-6 rounded-lg border border-dashed border-hairline-strong px-6 py-12 text-center text-ink-secondary">
      <h2 className="mb-2 text-xl font-medium text-ink">
        該当するノートがありません
      </h2>
      <p className="mb-4 text-sm">
        条件を変更するか、新しいノートを作成してください。
      </p>
      <Link
        to="/notes/new"
        data-primary
        className={`${pillBtn} ${pillBtnPrimary}`}
      >
        最初のノートを作成
      </Link>
    </div>
  ) : (
    <NoteListViews notes={owned.notes} />
  );
}
