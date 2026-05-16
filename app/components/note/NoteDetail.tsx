import { Link, notFound } from "@tanstack/react-router";
import type { UserDTO } from "@/core/application/dto/identity";
import type { NoteId } from "@/core/application/dto/note";
import { isNotFoundError } from "@/core/application/errors";
import { loadNoteDetail } from "./loaders";
import { NoteActions } from "./NoteActions";

type Props = {
  user: UserDTO;
  noteId: NoteId;
};

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

export async function NoteDetail({ user, noteId }: Props) {
  let data: Awaited<ReturnType<typeof loadNoteDetail>>;
  try {
    data = await loadNoteDetail({ actorUserId: user.id, noteId });
  } catch (e) {
    if (isNotFoundError(e)) throw notFound();
    throw e;
  }
  const { note, backlinks, directoryPath } = data;

  return (
    <article className="note-detail">
      <header>
        <h1 className="page-title">{note.title}</h1>
        <div className="note-detail-meta">
          <span>作成: {formatDate(note.createdAt)}</span>
          <span className="dot">·</span>
          <span>更新: {formatDate(note.updatedAt)}</span>
          <span className="dot">·</span>
          <span>📁 {directoryPath}</span>
          {note.status === "trashed" ? (
            <span className="chip warning">ゴミ箱</span>
          ) : null}
        </div>
      </header>

      <NoteActions noteId={note.id} status={note.status} />

      <div
        className="note-detail-content"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized at write time
        dangerouslySetInnerHTML={{ __html: note.contentHtml }}
      />

      {backlinks.length > 0 ? (
        <section className="backlinks">
          <h2>バックリンク</h2>
          <ul>
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
        </section>
      ) : null}
    </article>
  );
}
