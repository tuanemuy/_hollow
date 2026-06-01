import type { UserDTO } from "@/core/application/dto/identity";
import type { NoteId } from "@/core/application/dto/note";
import { isNotFoundError } from "@/core/application/errors";
import { isBusinessRuleError } from "@/core/domain/error";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import {
  loadAllTags,
  loadDirectoryTreeFlat,
  loadNoteDetail,
  loadPublishStateForNote,
} from "../loaders";
import { FrontMatterPanel } from "./FrontMatterPanel";
import { NoteActions } from "./NoteActions";
import { NoteBreadcrumb } from "./NoteBreadcrumb";
import { NoteMetaPanel } from "./NoteMetaPanel";

/**
 * Server async component for the note detail page (P11).
 *
 * Resolves note detail, publication state, the owner directory tree
 * and the tag dictionary in parallel via `Promise.all`, then assembles
 * the view-model passed to the pure presentation panels.
 *
 * `loadNoteDetail` already returns the structured directory segments; the
 * tree is loaded separately because `NoteActions`' move dialog needs the
 * full flattened tree as `<select>` options.
 *
 * 注: TanStack Start の現バージョンでは、`renderServerComponent` 経由で
 * 実行される RSC コンポーネント内で `throw notFound()` を投げても route の
 * `notFoundComponent` に届かず、通常の error として errorComponent に流れる
 * （`.issue/12/adr.md` ADR-004 / `ExportJobDetail/Page.tsx` 参照）。そのため
 * 非存在ノートは notFound() を経由せず notFound 用 JSX を直接返す。
 */
export type NoteDetailProps = Readonly<{
  user: UserDTO;
  noteId: NoteId;
}>;

export async function NoteDetail({ user, noteId }: NoteDetailProps) {
  const noteIdStr = noteId as unknown as string;

  let detail: Awaited<ReturnType<typeof loadNoteDetail>>;
  let publishState: Awaited<ReturnType<typeof loadPublishStateForNote>>;
  let tree: Awaited<ReturnType<typeof loadDirectoryTreeFlat>>;
  let tags: Awaited<ReturnType<typeof loadAllTags>>;

  try {
    [detail, publishState, tree, tags] = await Promise.all([
      loadNoteDetail({ actorUserId: user.id, noteId }),
      // Trashed notes have their publication forced private and share links
      // revoked by `handleNoteTrashedEvent`, but `listShareLinks` still throws
      // `NoteErrorCode.Trashed` for them. Absorb only that error into the
      // equivalent post-trash state so the detail page renders instead of
      // hitting the error boundary; re-throw anything else.
      loadPublishStateForNote({
        actorUserId: user.id,
        noteId: noteIdStr,
      }).catch((e): Awaited<ReturnType<typeof loadPublishStateForNote>> => {
        if (isBusinessRuleError(e) && e.code === NoteErrorCode.Trashed) {
          return { visibility: "private", publishedAt: null, links: [] };
        }
        throw e;
      }),
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

  const { note, backlinks, backlinkCount, directorySegments } = detail;

  const tagNames = note.tagIds
    .map((id) => tags.byId.get(id as unknown as string))
    .filter((name): name is string => name !== undefined);

  const firstActiveLink =
    publishState.links.find((l) => l.status === "active") ?? null;
  const publicShareUrl = firstActiveLink === null ? null : firstActiveLink.url;

  return (
    <article className="max-w-[760px] mx-auto">
      <header>
        <NoteBreadcrumb segments={directorySegments} noteTitle={note.title} />
        <h1 className="text-3xl font-regular tracking-tightest leading-tight text-ink mb-[10px] [overflow-wrap:anywhere]">
          {note.title}
        </h1>

        <NoteActions
          noteId={note.id}
          status={note.status}
          visibility={publishState.visibility}
          publicShareUrl={publicShareUrl}
          tree={tree.flat}
        />
      </header>

      <div
        className="note-detail-content"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized at write time
        dangerouslySetInnerHTML={{ __html: note.contentHtml }}
      />

      <NoteMetaPanel
        noteId={note.id}
        createdAt={note.createdAt}
        updatedAt={note.updatedAt}
        tagNames={tagNames}
        publishedAt={publishState.publishedAt}
        status={note.status}
        backlinks={backlinks}
        backlinkCount={backlinkCount}
      />

      <FrontMatterPanel frontMatter={note.frontMatter} />
    </article>
  );
}
