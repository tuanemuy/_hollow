import { Link, notFound } from "@tanstack/react-router";
import { cache } from "react";
import { isNotFoundError } from "@/core/application/errors";
import { serverData } from "@/core/presentation/serverAction";
import { avatarInitials, PublicLayout } from "./PublicLayout";

type LookupArgs =
  | { kind: "bySlug"; username: string; slug: string }
  | { kind: "byId"; noteId: string };

const loadPublicNote = cache(
  serverData(
    () => import("@/core/application/publication/getPublicNote"),
    async ({ container }, { getPublicNote }, args: LookupArgs) => {
      try {
        return await getPublicNote({ container, input: args });
      } catch (error) {
        if (isNotFoundError(error)) throw notFound();
        throw error;
      }
    },
  ),
);

export async function PublicNoteDetail({ args }: { args: LookupArgs }) {
  const { note, owner, tagNames, publishedAt } = await loadPublicNote(args);

  return (
    <PublicLayout>
      <div className="note-detail-wrap">
        <nav className="note-detail-breadcrumb" aria-label="パンくず">
          <Link
            to="/u/$username"
            params={{ username: owner.username }}
            search={{ page: 1, limit: 20 }}
          >
            {owner.displayName} (@{owner.username})
          </Link>
          <span aria-hidden="true">›</span>
          <span className="current">{note.title}</span>
        </nav>

        <Link
          to="/u/$username"
          params={{ username: owner.username }}
          search={{ page: 1, limit: 20 }}
          className="author-mini"
        >
          <span className="author-avatar" aria-hidden="true">
            {avatarInitials(owner.displayName || owner.username)}
          </span>
          <span>
            <span className="author-mini-name">{owner.displayName}</span>
            <span className="author-mini-username">@{owner.username}</span>
          </span>
        </Link>

        <h1 className="doc-title">{note.title}</h1>

        <div className="note-meta-inline">
          {publishedAt !== null ? (
            <span>公開 {formatJaDate(publishedAt)}</span>
          ) : null}
          {publishedAt !== null ? <span className="dot">·</span> : null}
          <span>更新 {formatJaDate(new Date(note.updatedAt))}</span>
          {tagNames.length > 0 ? <span className="dot">·</span> : null}
          {tagNames.length > 0 ? (
            <span>
              {tagNames.map((t) => (
                <span key={t} className="tag">
                  #{t}
                </span>
              ))}
            </span>
          ) : null}
          <span className="dot">·</span>
          <span className="pub-pill">
            <span className="pub-pill-dot" aria-hidden="true" />
            公開中
          </span>
        </div>

        <article
          className="note-detail-content"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitized at save time via HtmlSanitizer
          dangerouslySetInnerHTML={{ __html: note.contentHtml }}
        />
      </div>
    </PublicLayout>
  );
}

function formatJaDate(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
