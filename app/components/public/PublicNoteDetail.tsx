import { Link } from "@tanstack/react-router";
import { cache } from "react";
import { isNotFoundError } from "@/core/application/errors";
import { serverData } from "@/core/presentation/serverAction";
import { CodeHighlight } from "../note/content/CodeHighlight";
import { ErrorPage } from "./ErrorPage";
import { avatarInitials, PublicLayout } from "./PublicLayout";
import {
  AUTHOR_AVATAR_MD,
  AUTHOR_MINI,
  BACKLINK_ICON,
  BACKLINK_ITEM,
  BACKLINK_LIST,
  BACKLINK_TEXT,
  DOC_TITLE,
  NOTE_BOTTOM_META,
  NOTE_BOTTOM_META_TAGS,
  NOTE_DETAIL_BREADCRUMB,
  NOTE_DETAIL_WRAP,
  NOTE_META_INLINE,
  PUB_PILL,
  PUB_PILL_DOT,
  RELATED_CARD,
  RELATED_GRID,
  RELATED_META,
  RELATED_TAGS,
  RELATED_TITLE,
  SECTION_BLOCK,
  SECTION_TITLE,
} from "./styles";

type LookupArgs =
  | { kind: "bySlug"; username: string; slug: string }
  | { kind: "byId"; noteId: string };

const loadPublicNote = cache(
  serverData(
    () => import("@/core/application/publication/getPublicNote"),
    async ({ container }, { getPublicNote }, args: LookupArgs) =>
      getPublicNote({ container, input: args }),
  ),
);

const loadPublicBacklinks = cache(
  serverData(
    () => import("@/core/application/publication/listPublicBacklinks"),
    async ({ container }, { listPublicBacklinks }, noteId: string) =>
      listPublicBacklinks({ container, input: { noteId } }),
  ),
);

const RELATED_LIMIT = 4;

const loadRelatedPublicNotes = cache(
  serverData(
    () => import("@/core/application/publication/listRelatedPublicNotes"),
    async (
      { container },
      { listRelatedPublicNotes },
      args: { ownerId: string; excludeNoteId: string },
    ) =>
      listRelatedPublicNotes({
        container,
        input: {
          kind: "byOwnerId",
          ownerId: args.ownerId,
          excludeNoteId: args.excludeNoteId,
          limit: RELATED_LIMIT,
        },
      }),
  ),
);

export async function PublicNoteDetail({ args }: { args: LookupArgs }) {
  let loaded: Awaited<ReturnType<typeof loadPublicNote>>;
  try {
    loaded = await loadPublicNote(args);
  } catch (error) {
    // RSC 内 notFound() は notFoundComponent に届かないため、ルート意図の ErrorPage を直接返す。ADR-004 / Issue #599
    if (isNotFoundError(error)) return <ErrorPage kind="gone" />;
    throw error;
  }
  const { note, renderedContentHtml, owner, tagNames, publishedAt } = loaded;

  const [{ backlinks }, { notes: relatedNotes }] = await Promise.all([
    loadPublicBacklinks(note.id),
    loadRelatedPublicNotes({ ownerId: owner.id, excludeNoteId: note.id }),
  ]);

  return (
    <PublicLayout>
      <div className={NOTE_DETAIL_WRAP}>
        <nav className={NOTE_DETAIL_BREADCRUMB} aria-label="パンくず">
          <Link
            to="/u/$username"
            params={{ username: owner.username }}
            search={{}}
            className="text-ink-secondary hover:text-ink"
          >
            {owner.displayName} (@{owner.username})
          </Link>
          <span aria-hidden="true">›</span>
          <span className="text-ink font-medium overflow-hidden text-ellipsis whitespace-nowrap max-w-[30rem] min-w-0 max-sm:max-w-full">
            {note.title}
          </span>
        </nav>

        <Link
          to="/u/$username"
          params={{ username: owner.username }}
          search={{}}
          className={AUTHOR_MINI}
        >
          <span className={AUTHOR_AVATAR_MD} aria-hidden="true">
            {avatarInitials(owner.displayName || owner.username)}
          </span>
          <span>
            <span className="text-sm font-medium text-ink">
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
                <Link
                  key={t}
                  to="/u/$username"
                  params={{ username: owner.username }}
                  search={{ tags: [t] }}
                  className="text-accent mr-1"
                >
                  #{t}
                </Link>
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
          dangerouslySetInnerHTML={{ __html: renderedContentHtml }}
        />
        <CodeHighlight />

        <div className={NOTE_BOTTOM_META}>
          {tagNames.length > 0 ? (
            <div className={NOTE_BOTTOM_META_TAGS}>
              {tagNames.map((t) => (
                <span key={t} className="text-accent">
                  #{t}
                </span>
              ))}
            </div>
          ) : null}
          <div className="ml-auto">
            {publishedAt !== null
              ? `${formatJaDate(publishedAt)} 公開 · `
              : null}
            {formatJaDate(new Date(note.updatedAt))} 更新
          </div>
        </div>

        {backlinks.length > 0 ? (
          <section className={SECTION_BLOCK}>
            <div className={SECTION_TITLE}>バックリンク（公開ノート）</div>
            <div className={BACKLINK_LIST}>
              {backlinks.map((b) => (
                <Link
                  key={b.noteId}
                  to="/notes/public/$noteId"
                  params={{ noteId: b.noteId }}
                  className={BACKLINK_ITEM}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className={BACKLINK_ICON}
                    aria-hidden="true"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  <span className={BACKLINK_TEXT}>{b.title}</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {relatedNotes.length > 0 ? (
          <section className={SECTION_BLOCK}>
            <div className={SECTION_TITLE}>同じ著者の他のノート</div>
            <div className={RELATED_GRID}>
              {relatedNotes.map((r) => (
                <Link
                  key={r.id}
                  to="/notes/public/$noteId"
                  params={{ noteId: r.id }}
                  className={RELATED_CARD}
                >
                  <div className={RELATED_TITLE}>{r.title}</div>
                  <div className={RELATED_META}>
                    {r.tagNames.length > 0 ? (
                      <span className={RELATED_TAGS}>#{r.tagNames[0]}</span>
                    ) : null}
                    {r.publishedAt !== null
                      ? formatJaDate(new Date(r.publishedAt))
                      : null}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </PublicLayout>
  );
}

function formatJaDate(input: Date | string): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}
