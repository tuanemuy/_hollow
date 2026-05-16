import { Link } from "@tanstack/react-router";
import { loadOwnedNotes } from "@/components/note/loaders";
import type { UserDTO } from "@/core/application/dto/identity";
import { TrashRowActions } from "./TrashRowActions";

type Props = {
  user: UserDTO;
  page: number;
  limit: number;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export async function TrashList({ user, page, limit }: Props) {
  const { notes, count } = await loadOwnedNotes({
    actorUserId: user.id,
    status: "trashed",
    page,
    limit,
  });

  return (
    <>
      <h1 className="page-title">ゴミ箱</h1>
      <p className="page-subtitle">
        {count}{" "}
        件のノートがゴミ箱にあります。保存期間を過ぎたものは自動的に完全削除されます。
      </p>

      {notes.length === 0 ? (
        <div className="empty-state">
          <h2>ゴミ箱は空です</h2>
          <p>削除したノートはここに表示されます。</p>
          <Link to="/" className="pill-btn">
            すべてのノートに戻る
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
                  <span>削除日 {formatDate(note.updatedAt)}</span>
                </div>
              </div>
              <TrashRowActions noteId={note.id as unknown as string} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
