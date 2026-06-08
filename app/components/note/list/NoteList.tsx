import { Link } from "@tanstack/react-router";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import type { UserDTO } from "@/core/application/dto/identity";
import type { SavedViewDTO } from "@/core/application/dto/view";
import type { FlatDirectory, OwnedNotesResult } from "../loaders";
import type { NoteListSearch } from "../schema";
import { BottomCtaBar } from "./BottomCtaBar";
import { BulkActionBar } from "./BulkActionBar";
import { FilterBar } from "./FilterBar";
import { NoteListToolbar } from "./NoteListToolbar";
import { NoteListViews } from "./NoteListViews";
import { SelectionProvider } from "./SelectionContext";

type Props = {
  user: UserDTO;
  page: number;
  limit: number;
  data: OwnedNotesResult;
  tree: readonly FlatDirectory[];
  tags: ReadonlyArray<{ id: string; name: string; noteCount: number }>;
  savedViews: readonly SavedViewDTO[];
  search: NoteListSearch;
  referencingNoteTitle?: string | null;
};

/**
 * Top-level home/listing component (server async). The shell renders
 * synchronously from the loader-resolved props; only the toolbar / filter
 * controls / dialogs run on the client inside `<SelectionProvider>`.
 *
 * Display mode (list / tile / calendar) is URL-driven via
 * `search.display`. Visibility badge / `updatedAt` are always real
 * values since Issue #48 — `searchOwnNotes` materialises them via
 * `NoteRepository.findByIds`, so the previous `showVisibilityBadge =
 * kind === "filter"` guard (`.issue/1/adr.md` ADR-013) and the
 * `CalendarView` search-mode fallback (ADR-014) are no longer needed.
 * The `showVisibilityBadge` prop itself is gone from the view
 * components — the chip is now unconditionally rendered. `kind` is
 * still threaded through downstream as the pagination-mode
 * discriminant (cursor vs page-offset).
 */
export function NoteList({
  user: _user,
  page: _page,
  limit: _limit,
  data,
  tree,
  tags,
  savedViews,
  search,
  referencingNoteTitle,
}: Props) {
  const { notes, count, kind } = data;
  const searchActive = kind === "search";

  // Resolve the selected directory's display name from the already-loaded
  // tree (no extra I/O). An id not present in the tree (e.g. just deleted)
  // leaves this undefined; FilterBar falls back to a generic label.
  const directoryName =
    search.directoryId === undefined
      ? undefined
      : tree.find((d) => d.id === search.directoryId)?.name;

  const hasAnyFilter =
    (search.tagNames !== undefined && search.tagNames.length > 0) ||
    search.from !== undefined ||
    search.to !== undefined ||
    search.directoryId !== undefined ||
    search.visibility !== undefined ||
    search.referencingNoteId !== undefined;

  const headingText = searchActive
    ? `「${search.q ?? ""}」の検索結果`
    : "すべてのノート";

  return (
    <SelectionProvider>
      <h1 className="text-3xl font-regular tracking-tightest leading-tight text-ink mb-[10px] [overflow-wrap:anywhere]">
        {headingText}
      </h1>
      <p className="text-md text-ink-secondary mb-7">{count} 件のノート</p>

      <NoteListToolbar
        search={search}
        savedViews={savedViews}
        hasAnyFilter={hasAnyFilter || search.q !== undefined}
      />

      <FilterBar
        tags={tags}
        selectedTagNames={search.tagNames ?? []}
        from={search.from}
        to={search.to}
        visibility={search.visibility}
        directoryId={search.directoryId}
        {...(directoryName !== undefined ? { directoryName } : {})}
        referencingNoteId={search.referencingNoteId}
        {...(referencingNoteTitle !== undefined
          ? { referencingNoteTitle }
          : {})}
      />

      {notes.length === 0 ? (
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
        <NoteListViews notes={notes} />
      )}

      <BulkActionBar tree={tree} />
      <BottomCtaBar />
    </SelectionProvider>
  );
}
