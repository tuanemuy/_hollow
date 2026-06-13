import type { UserDTO } from "@/core/application/dto/identity";
import { isNotFoundError } from "@/core/application/errors";
import { CodeHighlight } from "../content/CodeHighlight";
import { loadNoteRevisionDetail } from "../loaders";
import { NoteRevisionRestorePanel } from "./NoteRevisionRestorePanel";

/**
 * P11h-detail — read-only viewer for a single past `NoteRevision`.
 *
 * Reuses the `.note-detail-content` style block from the live note
 * detail page so headings / lists / code render identically. Restoration
 * is a client interaction (`NoteRevisionRestorePanel`) so the parent
 * component can stay an RSC.
 *
 * NotFound は `throw notFound()` ではなくインライン JSX を返す:
 * TanStack Start の現バージョンでは `renderServerComponent` 経由で実行される
 * RSC コンポーネント内で投げた `notFound()` が route の `notFoundComponent`
 * に届かず errorComponent に流れる。`ExportJobDetailPage` と同パターン。
 */
export type NoteRevisionDetailProps = Readonly<{
  user: UserDTO;
  noteId: string;
  revisionId: string;
}>;

export async function NoteRevisionDetail({
  user,
  noteId,
  revisionId,
}: NoteRevisionDetailProps) {
  let result: Awaited<ReturnType<typeof loadNoteRevisionDetail>>;
  try {
    result = await loadNoteRevisionDetail({
      actorUserId: user.id,
      noteId,
      revisionId,
    });
  } catch (e) {
    if (isNotFoundError(e)) {
      return (
        <article className="max-w-[var(--content-max)] mx-auto" role="alert">
          <h1 className="text-2xl font-regular tracking-tightest leading-tight text-ink mb-2">
            過去版が見つかりません
          </h1>
          <p className="text-sm text-ink-secondary">
            削除されているか、アクセス権限がありません。
          </p>
        </article>
      );
    }
    throw e;
  }

  const { revision, renderedContentHtml, note } = result;

  return (
    <article className="max-w-[var(--content-max)] mx-auto">
      <header className="mb-6">
        <p className="text-sm text-ink-secondary mb-2">過去版</p>
        <h1 className="text-2xl font-regular tracking-tightest leading-tight text-ink mb-2 [overflow-wrap:anywhere]">
          {revision.title}
        </h1>
        <p className="text-xs text-ink-secondary tabular-nums">
          <time dateTime={revision.createdAt}>
            {new Date(revision.createdAt).toLocaleString()}
          </time>
          に保存
        </p>
      </header>

      <NoteRevisionRestorePanel
        noteId={revision.noteId}
        revisionId={revision.id}
        noteStatus={note.status}
      />

      <div
        className="note-detail-content"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized at write time
        dangerouslySetInnerHTML={{ __html: renderedContentHtml }}
      />
      <CodeHighlight />
    </article>
  );
}
