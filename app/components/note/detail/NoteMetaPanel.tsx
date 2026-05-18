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
  return (
    <section className="meta-panel" aria-label="ノートのメタ情報">
      <dl className="meta-panel-grid">
        <div className="meta-panel-row">
          <dt>作成日</dt>
          <dd>{formatDate(createdAt)}</dd>
        </div>
        <div className="meta-panel-row">
          <dt>更新日</dt>
          <dd>{formatDate(updatedAt)}</dd>
        </div>
        <div className="meta-panel-row">
          <dt>ディレクトリ</dt>
          <dd>
            <span className="meta-panel-path">{directoryPath}</span>
          </dd>
        </div>
        <div className="meta-panel-row">
          <dt>公開状態</dt>
          <dd>
            <span className={`chip ${visibility}`}>
              {visibilityLabel(visibility)}
            </span>
            {publishedAt !== null ? (
              <span className="meta-panel-published">
                公開日 {formatDate(publishedAt)}
              </span>
            ) : null}
            {status === "trashed" ? (
              <span className="chip warning">ゴミ箱</span>
            ) : null}
          </dd>
        </div>
        <div className="meta-panel-row">
          <dt>タグ</dt>
          <dd>
            {tagNames.length === 0 ? (
              <span className="meta-panel-empty">なし</span>
            ) : (
              <ul className="meta-panel-tags">
                {tagNames.map((name) => (
                  <li key={name}>
                    <span className="chip">#{name}</span>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div className="meta-panel-row">
          <dt>バックリンク</dt>
          <dd>
            <span className="meta-panel-backlink-count">
              {backlinks.length} 件
            </span>
            <div className="meta-panel-referencing">
              <Link
                to="/"
                search={{ ...HOME_SEARCH, referencingNoteId: noteIdStr }}
              >
                このノートを参照しているノート一覧を見る
              </Link>
            </div>
            {backlinks.length > 0 ? (
              <ul className="meta-panel-backlinks">
                {backlinks.map((bl) => (
                  <li key={bl.noteId as unknown as string}>
                    <Link
                      to="/notes/$noteId"
                      params={{ noteId: bl.noteId as unknown as string }}
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
