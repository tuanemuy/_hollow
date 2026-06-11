import { Link } from "@tanstack/react-router";
import { Suspense } from "react";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import { BulkActionBar } from "./list/BulkActionBar";
import { FilterBar } from "./list/FilterBar";
import { NoteListToolbar } from "./list/NoteListToolbar";
import { NoteListViews } from "./list/NoteListViews";
import { SelectionProvider } from "./list/SelectionContext";
import {
  FilterBarSkeleton,
  NoteListSkeleton,
  ToolbarSkeleton,
} from "./list/skeletons";
import {
  loadAllTags,
  loadDirectoryTreeFlat,
  loadOwnedNotes,
  loadReferencingNoteTitle,
  loadSavedViewsByKind,
} from "./loaders";
import type { NoteListSearch } from "./schema";

type Props = {
  userId: string;
  page: number;
  limit: number;
  search: NoteListSearch;
};

/**
 * Home page composition (Issue #636). The shell (heading + selection
 * context) renders synchronously from the URL-derived search; each
 * data-dependent section is an async server component inside its own
 * `<Suspense>` + `SectionErrorBoundary`, so one slow / failing loader no
 * longer blocks or breaks the whole page. Sections await the
 * `cache(serverData(...))` loaders directly — same-render dedup keeps
 * shared data (tree, tags) at one fetch (`.issue/636/adr.md` ADR-002).
 *
 * Boundary granularity: the toolbar (saved views) and the filter bar
 * (tags + tree + referencing title — a single client component requiring
 * multiple loaders) are merge boundaries per ADR-004/ADR-005; the note
 * listing (including the count line, which depends on `owned.count`) is
 * its own boundary.
 */
export function HomePage({ userId, page, limit, search }: Props) {
  const searchActive = search.q !== undefined && search.q.trim().length > 0;
  const headingText = searchActive
    ? `「${search.q ?? ""}」の検索結果`
    : "すべてのノート";

  const hasAnyFilter =
    (search.tagNames !== undefined && search.tagNames.length > 0) ||
    search.from !== undefined ||
    search.to !== undefined ||
    search.directoryId !== undefined ||
    search.visibility !== undefined ||
    search.referencingNoteId !== undefined;

  return (
    <SelectionProvider>
      <h1 className="text-3xl font-regular tracking-tightest leading-tight text-ink mb-[10px] [overflow-wrap:anywhere]">
        {headingText}
      </h1>

      <SectionErrorBoundary section="ツールバー">
        <Suspense fallback={<ToolbarSkeleton />}>
          <ToolbarSection
            userId={userId}
            search={search}
            hasAnyFilter={hasAnyFilter || search.q !== undefined}
          />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary section="フィルタ">
        <Suspense fallback={<FilterBarSkeleton />}>
          <FilterSection userId={userId} search={search} />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary section="ノート一覧">
        <Suspense fallback={<NoteListSkeleton />}>
          <NotesSection
            userId={userId}
            page={page}
            limit={limit}
            search={search}
          />
        </Suspense>
      </SectionErrorBoundary>
    </SelectionProvider>
  );
}

async function ToolbarSection({
  userId,
  search,
  hasAnyFilter,
}: Readonly<{
  userId: string;
  search: NoteListSearch;
  hasAnyFilter: boolean;
}>) {
  const { views } = await loadSavedViewsByKind({
    actorUserId: userId,
    kind: "personal",
  });
  return (
    <NoteListToolbar
      search={search}
      savedViews={views}
      hasAnyFilter={hasAnyFilter}
    />
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
          that already awaits it (plan step 4 / ADR-002 dedup). */}
      <BulkActionBar tree={flat} />
    </>
  );
}

async function NotesSection({
  userId,
  page,
  limit,
  search,
}: Readonly<{
  userId: string;
  page: number;
  limit: number;
  search: NoteListSearch;
}>) {
  const owned = await loadOwnedNotes({
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
  });

  return (
    <>
      <p className="text-md text-ink-secondary mb-7">
        {owned.count} 件のノート
      </p>
      {owned.notes.length === 0 ? (
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
      )}
    </>
  );
}
