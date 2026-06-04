import { Link } from "@tanstack/react-router";
import { pillBtn } from "@/components/common/styles";
import type { UserDTO } from "@/core/application/dto/identity";
import { isNotFoundError } from "@/core/application/errors";
import { loadNoteDetail, loadNoteRevisions } from "../loaders";
import { historyNavSearch } from "./historyPagination";

/**
 * P11h — list of past `NoteRevision` snapshots for a single note.
 *
 * Renders the note title (so the page is self-describing) and a simple
 * "newest first" list of revision rows. Trashed notes are listed too so
 * the user can inspect history before the retention purge; the restore
 * action on the detail page is the place that gates the trashed state.
 *
 * NotFound は `throw notFound()` ではなくインライン JSX を返す
 * （`NoteRevisionDetail` 参照: RSC 経由 notFound() が
 * route の `notFoundComponent` に届かない既知制約のため）。
 */
export type NoteHistoryListProps = Readonly<{
  user: UserDTO;
  noteId: string;
  page: number;
  limit: number;
}>;

export async function NoteHistoryList({
  user,
  noteId,
  page,
  limit,
}: NoteHistoryListProps) {
  const offset = (page - 1) * limit;

  let detail: Awaited<ReturnType<typeof loadNoteDetail>>;
  let revisionsResult: Awaited<ReturnType<typeof loadNoteRevisions>>;
  try {
    [detail, revisionsResult] = await Promise.all([
      loadNoteDetail({ actorUserId: user.id, noteId }),
      loadNoteRevisions({
        actorUserId: user.id,
        noteId,
        limit,
        offset,
      }),
    ]);
  } catch (e) {
    if (isNotFoundError(e)) {
      return (
        <article className="max-w-[760px] mx-auto" role="alert">
          <h1 className="text-2xl font-regular tracking-tightest leading-tight text-ink mb-2">
            ノートが見つかりません
          </h1>
          <p className="text-sm text-ink-secondary">
            削除されているか、アクセス権限がありません。
          </p>
        </article>
      );
    }
    throw e;
  }

  const { note } = detail;
  const { revisions, totalCount } = revisionsResult;
  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / limit);

  // Issue #215: pagination link payload is built by `historyNavSearch`
  // so default-equal `page` / `limit` are dropped from the URL. The
  // helper lives in `./historyPagination` to keep the normalisation
  // unit-testable.

  return (
    <article className="max-w-[760px] mx-auto">
      <header className="mb-6">
        <p className="text-sm text-ink-secondary mb-2">
          <Link to="/notes/$noteId" params={{ noteId }}>
            {note.title}
          </Link>
        </p>
        <h1 className="text-2xl font-regular tracking-tightest leading-tight text-ink">
          履歴
        </h1>
        <p className="text-sm text-ink-secondary mt-2">
          保存ごとに過去版が積み上がります。 全
          <span className="mx-1 tabular-nums">{totalCount}</span>
          件。
        </p>
      </header>

      {revisions.length === 0 ? (
        <div className="rounded-lg border border-hairline p-6 text-sm text-ink-secondary">
          このノートにはまだ履歴がありません。
          一度保存すると最初の履歴が記録されます。
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {revisions.map((rev) => (
            <li
              key={rev.id}
              className="flex items-center justify-between gap-3 rounded-md border border-hairline px-4 py-3"
            >
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-sm text-ink [overflow-wrap:anywhere]">
                  {rev.title}
                </span>
                <time
                  className="text-xs text-ink-secondary tabular-nums"
                  dateTime={rev.createdAt}
                >
                  {new Date(rev.createdAt).toLocaleString()}
                </time>
              </div>
              <Link
                to="/notes/$noteId/history/$revisionId"
                params={{
                  noteId,
                  revisionId: rev.id,
                }}
                className={pillBtn}
              >
                閲覧
              </Link>
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 ? (
        <nav
          className="mt-6 flex items-center justify-between text-sm"
          aria-label="ページネーション"
        >
          {page > 1 ? (
            <Link
              to="/notes/$noteId/history"
              params={{ noteId }}
              search={historyNavSearch(page - 1, limit)}
              className={pillBtn}
            >
              前へ
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
          <span className="text-ink-secondary tabular-nums">
            {page} / {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              to="/notes/$noteId/history"
              params={{ noteId }}
              search={historyNavSearch(page + 1, limit)}
              className={pillBtn}
            >
              次へ
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
        </nav>
      ) : null}

      <div className="mt-8">
        <Link to="/notes/$noteId" params={{ noteId }}>
          ← ノートに戻る
        </Link>
      </div>
    </article>
  );
}
