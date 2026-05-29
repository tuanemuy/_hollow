import { Link } from "@tanstack/react-router";
import { HOME_SEARCH } from "@/components/auth/links";
import type { BacklinkDTO, NoteId } from "@/core/application/dto/note";
import type { Visibility } from "@/core/application/dto/publication";

/**
 * Pure presentational panel for note metadata.
 *
 * Side-effect free; receives already-resolved view-model props from the
 * server component (`NoteDetail`). The caller resolves `tagId -> name`
 * and `directoryId -> path` mappings before passing data in.
 */
export type NoteMetaPanelProps = Readonly<{
  noteId: NoteId;
  createdAt: string;
  updatedAt: string;
  directoryPath: string;
  tagNames: readonly string[];
  visibility: Visibility;
  publishedAt: string | null;
  status: "active" | "trashed";
  backlinks: readonly BacklinkDTO[];
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

function visibilityLabel(v: Visibility): string {
  switch (v) {
    case "public":
      return "公開";
    case "unlisted":
      return "限定公開";
    case "private":
      return "非公開";
  }
}

export function NoteMetaPanel({
  noteId,
  createdAt,
  updatedAt,
  directoryPath,
  tagNames,
  visibility,
  publishedAt,
  status,
  backlinks,
}: NoteMetaPanelProps) {
  const noteIdStr = noteId as unknown as string;
  const ROW = "grid grid-cols-[100px_1fr] items-start gap-3";
  const DT =
    "text-xs font-medium text-ink-tertiary uppercase tracking-[0.06em] pt-[2px]";
  const DD = "m-0 flex flex-wrap gap-2 items-center text-[13px] text-ink";
  const CHIP_BASE =
    "inline-flex items-center gap-[5px] h-7 px-3 rounded-pill text-xs";
  const visibilityChipClass = (v: Visibility): string => {
    if (v === "public") return `${CHIP_BASE} bg-success-surface text-success`;
    if (v === "unlisted") return `${CHIP_BASE} bg-warning-surface text-warning`;
    return `${CHIP_BASE} bg-surface text-ink-tertiary`;
  };

  return (
    <section
      className="my-4 mb-6 px-5 py-4 rounded-lg border border-hairline bg-surface-elevated"
      aria-label="ノートのメタ情報"
    >
      <dl className="grid grid-cols-1 gap-3 m-0">
        <div className={ROW}>
          <dt className={DT}>作成日</dt>
          <dd className={DD}>{formatDate(createdAt)}</dd>
        </div>
        <div className={ROW}>
          <dt className={DT}>更新日</dt>
          <dd className={DD}>{formatDate(updatedAt)}</dd>
        </div>
        <div className={ROW}>
          <dt className={DT}>ディレクトリ</dt>
          <dd className={DD}>
            <span className="font-mono text-mono text-ink-secondary">
              {directoryPath}
            </span>
          </dd>
        </div>
        <div className={ROW}>
          <dt className={DT}>公開状態</dt>
          <dd className={DD}>
            <span className={visibilityChipClass(visibility)}>
              {visibilityLabel(visibility)}
            </span>
            {publishedAt !== null ? (
              <span className="text-xs text-ink-tertiary">
                公開日 {formatDate(publishedAt)}
              </span>
            ) : null}
            {status === "trashed" ? (
              <span className={`${CHIP_BASE} bg-warning-surface text-warning`}>
                ゴミ箱
              </span>
            ) : null}
          </dd>
        </div>
        <div className={ROW}>
          <dt className={DT}>タグ</dt>
          <dd className={DD}>
            {tagNames.length === 0 ? (
              <span className="text-ink-tertiary italic">なし</span>
            ) : (
              <ul className="inline-flex flex-wrap gap-1.5 m-0 p-0 list-none">
                {tagNames.map((name) => (
                  <li key={name}>
                    <span className={`${CHIP_BASE} bg-surface text-ink`}>
                      #{name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div className={ROW}>
          <dt className={DT}>バックリンク</dt>
          <dd className={DD}>
            <span className="text-xs text-ink-tertiary">
              {backlinks.length} 件
            </span>
            <div className="basis-full mt-1">
              <Link
                to="/"
                search={{ ...HOME_SEARCH, referencingNoteId: noteIdStr }}
                className="text-accent text-xs hover:underline"
              >
                このノートを参照しているノート一覧を見る
              </Link>
            </div>
            {backlinks.length > 0 ? (
              <ul className="basis-full flex flex-col gap-1 mt-2 p-0 list-none">
                {backlinks.map((bl) => (
                  <li key={bl.noteId as unknown as string}>
                    <Link
                      to="/notes/$noteId"
                      params={{ noteId: bl.noteId as unknown as string }}
                      className="text-accent hover:underline"
                    >
                      {bl.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </dd>
        </div>
      </dl>
    </section>
  );
}
