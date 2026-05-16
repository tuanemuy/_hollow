import { Link } from "@tanstack/react-router";
import type { UserDTO } from "@/core/application/dto/identity";
import { loadOwnedNotes } from "./loaders";

type Props = {
  user: UserDTO;
  page: number;
  limit: number;
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export async function NoteList({ user, page, limit }: Props) {
  const { notes, count } = await loadOwnedNotes({
    actorUserId: user.id,
    status: "active",
    page,
    limit,
  });

  return (
    <>
      <h1 className="page-title">すべてのノート</h1>
      <p className="page-subtitle">{count} 件のノート</p>

      <div className="toolbar">
        <div />
        <div style={{ display: "inline-flex", gap: "var(--space-2)" }}>
          <Link to="/notes/new" className="pill-btn primary">
            新規作成
          </Link>
          <Link to="/upload" className="pill-btn">
            アップロード
          </Link>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="empty-state">
          <h2>ノートがまだありません</h2>
          <p>最初のノートを作成して、Hollow を使い始めましょう。</p>
          <Link to="/notes/new" className="pill-btn primary">
            最初のノートを作成
          </Link>
        </div>
      ) : (
        <ul className="note-list">
          {notes.map((note) => (
            <li key={note.id} className="note-row">
              <div className="note-main">
                <div className="note-title">
                  <Link
                    to="/notes/$noteId"
                    params={{ noteId: note.id as unknown as string }}
                  >
                    {note.title}
                  </Link>
                </div>
                {note.excerpt.length > 0 ? (
                  <div className="note-snippet">{note.excerpt}</div>
                ) : null}
                <div className="note-meta">
                  {note.tagNames.length > 0 ? (
                    <span className="note-tags">
                      {note.tagNames.map((name) => `#${name}`).join(" ")}
                    </span>
                  ) : null}
                  {note.tagNames.length > 0 ? (
                    <span className="dot">·</span>
                  ) : null}
                  <span>{formatDate(note.updatedAt)}</span>
                </div>
              </div>
              <div className="note-date">{formatDate(note.updatedAt)}</div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
