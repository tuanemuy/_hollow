import { Suspense } from "react";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import type { UserDTO } from "@/core/application/dto/identity";
import { isNotFoundError } from "@/core/application/errors";
import { isBusinessRuleError } from "@/core/domain/error";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import { CodeHighlight } from "../content/CodeHighlight";
import {
  loadAllTags,
  loadDirectoryTreeFlat,
  loadNoteDetail,
  loadPublishStateForNote,
} from "../loaders";
import { FrontMatterPanel } from "./FrontMatterPanel";
import { NoteActions } from "./NoteActions";
import { NoteBreadcrumb } from "./NoteBreadcrumb";
import { NoteDetailSkeleton } from "./NoteDetailSkeleton";
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
 * notFound JSX は throw ではなく通常の戻り値なので、Suspense 境界の中でも
 * 安全に成立する（redirect / notFound throw とは異なる）。
 *
 * タイトル・本文・メタ・バックリンクはすべて単一の
 * `loadNoteDetail` ローダー由来のため、独立境界には分割せず 1 つの
 * `<Suspense>` 境界でストリーミングする（P11 モックも単一フォールバック）。
 */
export type NoteDetailProps = Readonly<{
  user: UserDTO;
  noteId: string;
  appUrl: string;
}>;

export function NoteDetail(props: NoteDetailProps) {
  return (
    <SectionErrorBoundary section="ノート" resetKey={props.noteId}>
      <Suspense fallback={<NoteDetailSkeleton />}>
        <NoteDetailContent {...props} />
      </Suspense>
    </SectionErrorBoundary>
  );
}

export async function NoteDetailContent({
  user,
  noteId,
  appUrl,
}: NoteDetailProps) {
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
        noteId,
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

  const {
    note,
    renderedContentHtml,
    backlinks,
    backlinkCount,
    directorySegments,
  } = detail;

  const tagNames = note.tagIds
    .map((id) => tags.byId.get(id))
    .filter((name): name is string => name !== undefined);

  const firstActiveLink =
    publishState.links.find((l) => l.status === "active") ?? null;
  // The active share link is the `/share/by-id/<id>` URL — used only for
  // unlisted notes. Public notes copy the canonical public URL below instead.
  const shareLinkUrl = firstActiveLink === null ? null : firstActiveLink.url;
  // Canonical public URL for the public route `/u/$username/$noteSlug`. Built
  // off the configured `appUrl` (same base as share links) so it stays the
  // canonical host. `slug` is `[a-z0-9][a-z0-9-]*` (NoteSlug invariant), so no
  // URL encoding is needed.
  const publicNoteUrl = `${appUrl.replace(/\/$/, "")}/u/${user.username}/${note.slug}`;

  return (
    <article>
      <header>
        <NoteBreadcrumb segments={directorySegments} noteTitle={note.title} />
        <h1 className="text-3xl font-regular tracking-tightest leading-tight text-ink mb-[10px] [overflow-wrap:anywhere]">
          {note.title}
        </h1>

        <NoteActions
          noteId={note.id}
          status={note.status}
          publishState={publishState}
          appUrl={appUrl}
          shareLinkUrl={shareLinkUrl}
          publicNoteUrl={publicNoteUrl}
          tree={tree.flat}
        />
      </header>

      <div
        className="note-detail-content"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: body sanitized at write time; wikilink/hashtag markup added by NoteBodyRenderer (XSS-escaped)
        dangerouslySetInnerHTML={{ __html: renderedContentHtml }}
      />
      <CodeHighlight />

      <NoteMetaPanel
        noteId={note.id}
        createdAt={note.createdAt}
        updatedAt={note.updatedAt}
        directorySegments={directorySegments}
        tagNames={tagNames}
        publishedAt={publishState.publishedAt}
        status={note.status}
        backlinks={backlinks}
        backlinkCount={backlinkCount}
        sourceFile={note.sourceFile}
      />

      <FrontMatterPanel frontMatter={note.frontMatter} />
    </article>
  );
}
