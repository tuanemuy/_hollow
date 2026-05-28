import { Link, notFound } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { cache } from "react";
import { Icon } from "@/components/common/Icon";
import { isNotFoundError } from "@/core/application/errors";
import { serverData } from "@/core/presentation/serverAction";
import { avatarInitials, PublicLayout } from "./PublicLayout";
import {
  EMPTY_LIST,
  NOTE_DATE,
  NOTE_LIST,
  NOTE_META,
  NOTE_ROW,
  NOTE_SNIPPET,
  NOTE_TAGS,
  NOTE_TITLE,
  NOTE_TITLE_ROW,
  PAGINATION,
  PILL_BTN,
  PROFILE_AVATAR,
  PROFILE_BIO,
  PROFILE_HERO,
  PROFILE_NAME,
  PROFILE_STATS,
  PROFILE_USERNAME,
  PUBLIC_MAIN,
  SEARCH_ICON,
  USER_SEARCH,
  USER_SEARCH_INPUT,
  USER_TOOLS,
} from "./styles";

const loadProfile = cache(
  serverData(
    () => import("@/core/application/publication/getPublicProfile"),
    async ({ container }, { getPublicProfile }, username: string) => {
      try {
        return await getPublicProfile({
          container,
          input: { username },
        });
      } catch (error) {
        if (isNotFoundError(error)) throw notFound();
        throw error;
      }
    },
  ),
);

const loadNotes = cache(
  serverData(
    () => import("@/core/application/publication/listUserPublicNotes"),
    async (
      { container },
      { listUserPublicNotes },
      args: { username: string; page: number; limit: number },
    ) => {
      try {
        return await listUserPublicNotes({
          container,
          input: args,
        });
      } catch (error) {
        if (isNotFoundError(error)) throw notFound();
        throw error;
      }
    },
  ),
);

type Props = {
  username: string;
  page: number;
  limit: number;
};

export async function UserPublicTop({ username, page, limit }: Props) {
  const [{ user, publicNoteCount }, { notes, total }] = await Promise.all([
    loadProfile(username),
    loadNotes({ username, page, limit }),
  ]);

  const initials = avatarInitials(user.displayName || user.username);
  const joinedAt = new Date(user.createdAt);
  const joinedLabel = formatYearMonth(joinedAt);

  return (
    <PublicLayout>
      <main className={PUBLIC_MAIN}>
        <section className={PROFILE_HERO}>
          <div className={PROFILE_AVATAR} aria-hidden="true">
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className={PROFILE_NAME}>{user.displayName}</h1>
            <div className={PROFILE_USERNAME}>@{user.username}</div>
            {user.bio !== null && user.bio.length > 0 ? (
              <p className={PROFILE_BIO}>{user.bio}</p>
            ) : null}
            <div className={PROFILE_STATS}>
              <span>
                <strong className="text-ink font-semibold mr-1">
                  {publicNoteCount}
                </strong>
                公開ノート
              </span>
              <span className="text-hairline-strong">·</span>
              <span>{joinedLabel}から</span>
            </div>
          </div>
        </section>

        <section className={USER_TOOLS}>
          <search className={USER_SEARCH}>
            <form method="get" action="/search">
              <Icon icon={Search} size={16} className={SEARCH_ICON} />
              <label
                htmlFor={`user-search-${user.username}`}
                className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)]"
              >
                このユーザーの公開ノートを検索
              </label>
              <input
                id={`user-search-${user.username}`}
                type="search"
                name="q"
                placeholder="このユーザーの公開ノートを検索"
                className={USER_SEARCH_INPUT}
              />
              <input type="hidden" name="username" value={user.username} />
            </form>
          </search>
        </section>

        <section className={NOTE_LIST} aria-label="公開ノート一覧">
          {notes.length === 0 ? (
            <div className={EMPTY_LIST}>
              公開されているノートはまだありません。
            </div>
          ) : (
            notes.map((note) => (
              <Link
                key={note.id}
                to="/u/$username/$noteSlug"
                params={{ username: user.username, noteSlug: note.slug }}
                className={NOTE_ROW}
              >
                <div className="min-w-0">
                  <div className={NOTE_TITLE_ROW}>
                    <div className={NOTE_TITLE}>{note.title}</div>
                  </div>
                  {note.excerpt.length > 0 ? (
                    <div className={NOTE_SNIPPET}>{note.excerpt}</div>
                  ) : null}
                  <div className={NOTE_META}>
                    {note.tagNames.length > 0 ? (
                      <span className={NOTE_TAGS}>
                        {note.tagNames.map((t) => `#${t}`).join(" ")}
                      </span>
                    ) : null}
                    <span>{formatDate(new Date(note.updatedAt))}</span>
                  </div>
                </div>
                <div className={NOTE_DATE}>
                  {formatShort(new Date(note.updatedAt))}
                </div>
              </Link>
            ))
          )}
        </section>

        {total > limit ? (
          <Pagination
            username={user.username}
            page={page}
            limit={limit}
            total={total}
          />
        ) : null}
      </main>
    </PublicLayout>
  );
}

// Issue #215: `/u/$username`'s search schema defaults to `page=1` /
// `limit=20`. Omit the matching values from the URL so default-equal
// pagination does not leak into the query string.
const USER_PUBLIC_DEFAULT_PAGE = 1;
const USER_PUBLIC_DEFAULT_LIMIT = 20;

function Pagination({
  username,
  page,
  limit,
  total,
}: {
  username: string;
  page: number;
  limit: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const navSearch = (nextPage: number): { page?: number; limit?: number } => ({
    ...(nextPage === USER_PUBLIC_DEFAULT_PAGE ? {} : { page: nextPage }),
    ...(limit === USER_PUBLIC_DEFAULT_LIMIT ? {} : { limit }),
  });
  return (
    <nav className={PAGINATION} aria-label="ページネーション">
      <span className="text-ink-tertiary text-[13px]">
        {page} / {totalPages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link
            to="/u/$username"
            params={{ username }}
            search={navSearch(page - 1)}
            className={PILL_BTN}
          >
            前へ
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link
            to="/u/$username"
            params={{ username }}
            search={navSearch(page + 1)}
            className={PILL_BTN}
          >
            次へ
          </Link>
        ) : null}
      </div>
    </nav>
  );
}

function formatYearMonth(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 更新`;
}

function formatShort(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
