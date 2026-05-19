import { Link, notFound } from "@tanstack/react-router";
import { cache } from "react";
import { isNotFoundError } from "@/core/application/errors";
import { serverData } from "@/core/presentation/serverAction";
import { avatarInitials, PublicLayout } from "./PublicLayout";
import {
  AUTHOR_AVATAR,
  AUTHOR_MINI,
  DOC_TITLE,
  NOTE_DETAIL_BREADCRUMB,
  NOTE_DETAIL_WRAP,
  NOTE_META_INLINE,
  PUB_PILL,
  PUB_PILL_DOT,
} from "./styles";

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
      <div className={NOTE_DETAIL_WRAP}>
        <nav className={NOTE_DETAIL_BREADCRUMB} aria-label="パンくず">
          <Link
            to="/u/$username"
            params={{ username: owner.username }}
            search={{ page: 1, limit: 20 }}
            className="text-ink-secondary hover:text-ink"
          >
            {owner.displayName} (@{owner.username})
          </Link>
          <span aria-hidden="true">›</span>
          <span className="text-ink font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-[60ch]">
            {note.title}
          </span>
        </nav>

        <Link
          to="/u/$username"
          params={{ username: owner.username }}
          search={{ page: 1, limit: 20 }}
          className={AUTHOR_MINI}
        >
          <span className={AUTHOR_AVATAR} aria-hidden="true">
            {avatarInitials(owner.displayName || owner.username)}
          </span>
          <span>
            <span className="text-[13px] font-medium text-ink">
              {owner.displayName}
            </span>
            <span className="text-xs text-ink-tertiary ml-0.5">
              @{owner.username}
            </span>
          </span>
        </Link>

        <h1 className={DOC_TITLE}>{note.title}</h1>

        <div className={NOTE_META_INLINE}>
          {publishedAt !== null ? (
            <span>公開 {formatJaDate(publishedAt)}</span>
          ) : null}
          {publishedAt !== null ? (
            <span className="text-hairline-strong">·</span>
          ) : null}
          <span>更新 {formatJaDate(new Date(note.updatedAt))}</span>
          {tagNames.length > 0 ? (
            <span className="text-hairline-strong">·</span>
          ) : null}
          {tagNames.length > 0 ? (
            <span>
              {tagNames.map((t) => (
                <span key={t} className="text-accent mr-1">
                  #{t}
                </span>
              ))}
            </span>
          ) : null}
          <span className="text-hairline-strong">·</span>
          <span className={PUB_PILL}>
            <span className={PUB_PILL_DOT} aria-hidden="true" />
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
