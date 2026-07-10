import type { UserDTO } from "@/core/application/dto/identity";
import { isNotFoundError } from "@/core/application/errors";
import { loadAllTags, loadDirectoryTreeFlat, loadNoteDetail } from "../loaders";
import { NoteEditor } from "./NoteEditor";

/**
 * Server async component that resolves the note editor's initial data (P12).
 *
 * Loads the note detail, the owner directory tree and the tag dictionary in
 * parallel, derives the `initialTagNames` / `initialEditLock` seed props, and
 * hands them to the `NoteEditor` client orchestrator. The `NoteEditor` props
 * contract and its lazy (once-only) initialization are unchanged — only the
 * call site moved from the route's server fn into this Suspense-streamed
 * section (Issue #819).
 *
 * 注: `throw notFound()` does not reach the route's `notFoundComponent` from
 * inside a `renderServerComponent` RSC (`.issue/12/adr.md` ADR-004 — same as
 * `NoteDetailContent`). So a missing note returns notFound JSX directly rather
 * than throwing; this intentionally unifies the editor with the detail page's
 * inline "見つかりません" treatment instead of the previous full-page
 * `RouteErrorFallback`.
 */
export type NoteEditorLoaderProps = Readonly<{
  user: UserDTO;
  noteId: string;
}>;

export async function NoteEditorLoader({
  user,
  noteId,
}: NoteEditorLoaderProps) {
  let detail: Awaited<ReturnType<typeof loadNoteDetail>>;
  let tree: Awaited<ReturnType<typeof loadDirectoryTreeFlat>>;
  let tags: Awaited<ReturnType<typeof loadAllTags>>;

  try {
    [detail, tree, tags] = await Promise.all([
      loadNoteDetail({ actorUserId: user.id, noteId }),
      loadDirectoryTreeFlat({ actorUserId: user.id }),
      loadAllTags({ actorUserId: user.id }),
    ]);
  } catch (e) {
    if (isNotFoundError(e)) {
      return (
        <div role="alert">
          <h1>ノートが見つかりません</h1>
          <p>削除されているか、アクセス権限がありません。</p>
        </div>
      );
    }
    throw e;
  }

  const { note } = detail;

  const initialTagNames = note.tagIds
    .map((id) => tags.byId.get(id))
    .filter((name): name is string => name !== undefined);

  const initialEditLock =
    note.editLock === null
      ? undefined
      : ({
          state: "acquired",
          lockId: null,
          expiresAt: new Date(note.editLock.expiresAt).getTime(),
        } as const);

  return (
    <NoteEditor
      mode="edit"
      noteId={note.id}
      initialTitle={note.title}
      initialContentHtml={note.contentHtml}
      initialFrontMatter={{ ...note.frontMatter }}
      initialTagNames={initialTagNames}
      initialDirectoryId={note.directoryId}
      {...(initialEditLock !== undefined ? { initialEditLock } : {})}
      tree={tree.flat}
      tagSuggestions={tags.tags.map((t) => t.name)}
    />
  );
}
