import { Link } from "@tanstack/react-router";
import { HOME_SEARCH } from "@/components/auth/links";
import type {
  BacklinkDTO,
  NoteSourceFileDTO,
} from "@/core/application/dto/note";

/**
 * Pure presentational panel for the *lower* note metadata region (P11).
 *
 * Side-effect free; receives an already-resolved view-model from the server
 * component (`NoteDetail`). It is rendered *below* the note body so the
 * supporting info (作成日 / 更新日 / 場所 / タグ / 公開日 / バックリンク) no
 * longer occupies the top of the reading area. Sections follow the mock order
 * (プロパティ → バックリンク).
 *
 * The 場所 (directory path) row is shown here per index.md §2.1 + the P11 mock,
 * reusing the same `directorySegments` the breadcrumb above renders — this is
 * the property view, not the navigation crumb, so the two coexist (Issue #540
 * ADR-002). Publish *state* is intentionally NOT repeated here: it lives in the
 * top action toolbar's publish pill (Issue #356 ADR-003 / #459).
 */
export type NoteMetaPanelProps = Readonly<{
  noteId: string;
  createdAt: string;
  updatedAt: string;
  directorySegments: readonly { id: string; name: string }[];
  tagNames: readonly string[];
  publishedAt: string | null;
  status: "active" | "trashed";
  backlinks: readonly BacklinkDTO[];
  backlinkCount: number;
  sourceFile: NoteSourceFileDTO | null;
}>;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SECTION = "mt-12 pt-6 border-t border-hairline";
const SECTION_HEADING =
  "text-xs font-medium text-ink-tertiary uppercase tracking-[0.06em] mb-3";
const META_ROW = "grid grid-cols-[100px_1fr] items-start gap-3 py-1";
const META_KEY = "text-sm text-ink-tertiary";
const META_VAL = "m-0 flex flex-wrap gap-2 items-center text-sm text-ink";
const CHIP =
  "inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-surface text-xs text-ink";

export function NoteMetaPanel({
  noteId,
  createdAt,
  updatedAt,
  directorySegments,
  tagNames,
  publishedAt,
  status,
  backlinks,
  backlinkCount,
  sourceFile,
}: NoteMetaPanelProps) {
  // The `/media/<id>` links below are rendered ONLY as UI controls. They
  // must never be injected into the note body HTML — `MEDIA_ID_FROM_URL`
  // would then fold the source file into `mediaRefs` / refCount and the
  // orphan purge could delete an in-use asset (Issue #452 ADR-002).
  const sourceMediaId = sourceFile === null ? null : sourceFile.mediaId;
  const sourceFileLabel =
    sourceFile === null ? null : sourceFile.originalFileName;

  // Root-level notes (no directory segments) mirror the breadcrumb's wording
  // rather than rendering an empty path (NoteBreadcrumb / Issue #356 ADR-002).
  const directoryPath =
    directorySegments.length === 0
      ? "すべてのノート"
      : directorySegments.map((s) => s.name).join(" / ");

  return (
    <>
      <section className={SECTION} aria-label="ノートのプロパティ">
        <h2 className={SECTION_HEADING}>プロパティ</h2>
        <dl className="grid grid-cols-1 gap-1 m-0">
          <div className={META_ROW}>
            <dt className={META_KEY}>作成日</dt>
            <dd className={META_VAL}>{formatDate(createdAt)}</dd>
          </div>
          <div className={META_ROW}>
            <dt className={META_KEY}>更新日</dt>
            <dd className={META_VAL}>{formatDate(updatedAt)}</dd>
          </div>
          <div className={META_ROW}>
            <dt className={META_KEY}>場所</dt>
            <dd className={META_VAL}>{directoryPath}</dd>
          </div>
          {publishedAt !== null ? (
            <div className={META_ROW}>
              <dt className={META_KEY}>公開日</dt>
              <dd className={META_VAL}>{formatDate(publishedAt)}</dd>
            </div>
          ) : null}
          <div className={META_ROW}>
            <dt className={META_KEY}>タグ</dt>
            <dd className={META_VAL}>
              {tagNames.length === 0 ? (
                <span className="text-ink-tertiary italic">なし</span>
              ) : (
                <ul className="inline-flex flex-wrap gap-1.5 m-0 p-0 list-none">
                  {tagNames.map((name) => (
                    <li key={name}>
                      <span className={CHIP}>#{name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          {sourceFile !== null && sourceMediaId !== null ? (
            <div className={META_ROW}>
              <dt className={META_KEY}>元ファイル</dt>
              <dd className={META_VAL}>
                <span className="[overflow-wrap:anywhere]">
                  {sourceFileLabel}
                </span>
                <a
                  href={`/media/${sourceMediaId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent text-xs hover:underline"
                >
                  閲覧
                </a>
                <a
                  href={`/media/${sourceMediaId}?download=1`}
                  className="text-accent text-xs hover:underline"
                >
                  ダウンロード
                </a>
              </dd>
            </div>
          ) : null}
          {status === "trashed" ? (
            <div className={META_ROW}>
              <dt className={META_KEY}>状態</dt>
              <dd className={META_VAL}>
                <span className="inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-warning-surface text-warning text-xs">
                  ゴミ箱
                </span>
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className={SECTION} aria-label="バックリンク">
        <h2 className={SECTION_HEADING}>バックリンク</h2>
        {backlinks.length === 0 ? (
          <p className="text-sm text-ink-tertiary m-0">なし</p>
        ) : (
          <ul className="flex flex-col gap-2 m-0 p-0 list-none">
            {backlinks.map((bl) => (
              <li key={bl.noteId}>
                <Link
                  to="/notes/$noteId"
                  params={{ noteId: bl.noteId }}
                  className="block px-4 py-3 rounded-lg border border-hairline text-sm font-medium text-ink transition-colors hover:bg-surface [overflow-wrap:anywhere]"
                >
                  {bl.title}
                  {bl.snippet !== null && bl.snippet.length > 0 ? (
                    <span className="block mt-1 text-sm font-normal text-ink-tertiary overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                      {bl.snippet}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          to="/"
          search={{ ...HOME_SEARCH, referencingNoteId: noteId }}
          className="inline-block mt-3 text-accent text-xs hover:underline"
        >
          このノートを参照しているノート一覧を見る（{backlinkCount} 件）
        </Link>
      </section>
    </>
  );
}
