import type { UserDTO } from "@/core/application/dto/identity";
import type { SavedViewDTO } from "@/core/application/dto/view";
import { NoteList } from "./list/NoteList";
import type { FlatDirectory, OwnedNotesResult } from "./loaders";
import type { NoteListSearch } from "./schema";

type Props = {
  user: UserDTO;
  page: number;
  limit: number;
  owned: OwnedNotesResult;
  tree: readonly FlatDirectory[];
  tags: ReadonlyArray<{ id: string; name: string; noteCount: number }>;
  savedViews: readonly SavedViewDTO[];
  search: NoteListSearch;
  referencingNoteTitle?: string | null;
};

/**
 * Home page shell. The route resolves every loader once with
 * `Promise.all` and threads the results through props so that children
 * (sidebar, list, toolbar) do not re-hit `serverData` and accidentally
 * defeat the `cache()`-based dedup.
 */
export function HomePage({
  user,
  page,
  limit,
  owned,
  tree,
  tags,
  savedViews,
  search,
  referencingNoteTitle,
}: Props) {
  return (
    <NoteList
      user={user}
      page={page}
      limit={limit}
      data={owned}
      tree={tree}
      tags={tags}
      savedViews={savedViews}
      search={search}
      {...(referencingNoteTitle !== undefined ? { referencingNoteTitle } : {})}
    />
  );
}
