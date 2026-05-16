import { Link } from "@tanstack/react-router";
import type { UserDTO } from "@/core/application/dto/identity";
import type { SavedViewDTO } from "@/core/application/dto/view";
import type { DisplayMode } from "../constants";
import type { FlatDirectory, OwnedNotesResult } from "../loaders";
import type { NoteListSearch } from "../schema";
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
};

/**
 * Top-level home/listing component (server async). The shell renders
 * synchronously from the loader-resolved props; only the toolbar / filter
 * controls / dialogs run on the client inside `<SelectionProvider>`.
 *
 * Display mode (list / tile / calendar) is URL-driven via
 * `search.display`. Visibility badges and the visibility filter are
 * only meaningful on the `searchOwnNotes` path; in the filter path the
 * `NoteListItemDTO.visibility` projection is currently fixed to
 * `'private'` (see ADR-001 / ADR-012).
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
}: Props) {
  const { notes, count, mode } = data;
  const display: DisplayMode = search.display ?? "list";
  const searchActive = mode === "search";
  const showVisibilityBadge = searchActive;

  const hasAnyFilter =
    (search.tagNames !== undefined && search.tagNames.length > 0) ||
    search.from !== undefined ||
    search.to !== undefined ||
    search.directoryId !== undefined ||
    search.visibility !== undefined;

  const headingText = searchActive
    ? `「${search.q ?? ""}」の検索結果`
    : "すべてのノート";

  return (
    <SelectionProvider>
      <h1 className="page-title">{headingText}</h1>
      <p className="page-subtitle">{count} 件のノート</p>

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
        searchActive={searchActive}
      />

      <BulkActionBar tree={tree} />

      {notes.length === 0 ? (
        <div className="empty-state">
          <h2>該当するノートがありません</h2>
          <p>条件を変更するか、新しいノートを作成してください。</p>
          <Link to="/notes/new" className="pill-btn primary">
            最初のノートを作成
          </Link>
        </div>
      ) : display === "tile" ? (
        <TileView notes={notes} showVisibilityBadge={showVisibilityBadge} />
      ) : display === "calendar" ? (
        <CalendarView notes={notes} mode={mode} />
      ) : (
        <ListView notes={notes} showVisibilityBadge={showVisibilityBadge} />
      )}
    </SelectionProvider>
  );
}
