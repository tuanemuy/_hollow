import { Link } from "@tanstack/react-router";
import type { UserDTO } from "@/core/application/dto/identity";
import type { SavedViewDTO } from "@/core/application/dto/view";
import type { DisplayMode } from "../constants";
import type { FlatDirectory, OwnedNotesResult } from "../loaders";
import type { NoteListSearch } from "../schema";
import { pillBtn, pillBtnPrimary } from "../styles";
import { BulkActionBar } from "./BulkActionBar";
import { CalendarView } from "./CalendarView";
import { FilterBar } from "./FilterBar";
import { ListView } from "./ListView";
import { NoteListToolbar } from "./NoteListToolbar";
import { SelectionProvider } from "./SelectionContext";
import { TileView } from "./TileView";

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
 * `search.display`. The visibility badge is shown on the filter path
 * (the listing usecase joins `publication_states` to project real
 * visibility) but suppressed on the search path, where
 * `NoteListItemDTO.visibility` is still a `'private'` placeholder
 * (see `.issue/1/adr.md` ADR-012 / `.issue/8/adr.md` ADR-010).
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
  const display: DisplayMode = search.display ?? "list";
  const searchActive = kind === "search";
  const showVisibilityBadge = kind === "filter";

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
        display={display}
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
        referencingNoteId={search.referencingNoteId}
        {...(referencingNoteTitle !== undefined
          ? { referencingNoteTitle }
          : {})}
      />

      <BulkActionBar tree={tree} />

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
      ) : display === "tile" ? (
        <TileView notes={notes} showVisibilityBadge={showVisibilityBadge} />
      ) : display === "calendar" ? (
        // CalendarView only supports the filter kind; search hits don't
        // carry `updatedAt`, so the calendar falls back to a message.
        kind === "filter" ? (
          <CalendarView notes={notes} kind="filter" />
        ) : (
          <CalendarView notes={[]} kind="search" />
        )
      ) : kind === "filter" ? (
        <ListView
          kind="filter"
          notes={notes}
          showVisibilityBadge={showVisibilityBadge}
        />
      ) : (
        <ListView
          kind="search"
          notes={notes}
          showVisibilityBadge={showVisibilityBadge}
        />
      )}
    </SelectionProvider>
  );
}
