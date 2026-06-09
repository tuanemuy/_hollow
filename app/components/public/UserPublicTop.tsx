import { Link, notFound } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { cache } from "react";
import { Icon } from "@/components/common/Icon";
import { isNotFoundError } from "@/core/application/errors";
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_DEFAULT_PAGE,
} from "@/core/presentation/pagination";
import { serverData } from "@/core/presentation/serverAction";
import { avatarInitials, PublicLayout } from "./PublicLayout";
import { type PublicNoteItem, PublicNoteViews } from "./PublicNoteViews";
import { PublicTopControls } from "./PublicTopControls";
import {
  EMPTY_LIST,
  NOTE_LIST,
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
      args: {
        username: string;
        page: number;
        limit: number;
        tagNames?: readonly string[];
        sort?: "publishedAt" | "updatedAt" | "createdAt" | "title";
      },
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
  tags?: readonly string[] | undefined;
  sort?: "publishedAt" | "updatedAt" | "createdAt" | "title" | undefined;
};

export async function UserPublicTop({
  username,
  page,
  limit,
  tags,
  sort,
}: Props) {
  const [{ user, publicNoteCount }, { notes, total }] = await Promise.all([
    loadProfile(username),
    loadNotes({
      username,
      page,
      limit,
      ...(tags !== undefined && tags.length > 0 ? { tagNames: tags } : {}),
      ...(sort !== undefined ? { sort } : {}),
    }),
  ]);

  const initials = avatarInitials(user.displayName || user.username);
  const joinedAt = new Date(user.createdAt);
  const joinedLabel = formatYearMonth(joinedAt);

  // Chip candidates: tags present in the current listing (deduped, capped
  // to keep the filter row compact). Selected-but-absent tags are merged
  // back in client-side so their remove affordance survives a narrowed page.
  const tagOptions = [...new Set(notes.flatMap((n) => n.tagNames))].slice(0, 8);

  const items: PublicNoteItem[] = notes.map((note) => ({
    id: note.id,
    slug: note.slug,
    title: note.title,
    excerpt: note.excerpt,
    tagNames: note.tagNames,
    updatedAt: note.updatedAt,
  }));

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

          <PublicTopControls tagOptions={tagOptions} />
        </section>

        <section className={NOTE_LIST} aria-label="公開ノート一覧">
          {items.length === 0 ? (
            <div className={EMPTY_LIST}>
              公開されているノートはまだありません。
            </div>
          ) : (
            <PublicNoteViews username={user.username} notes={items} />
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

// Issue #215: `/u/$username`'s search schema mirrors `paginationSearchSchema`'s
// defaults (`page=1` / `limit=20`). Reuse `PAGINATION_DEFAULT_*` directly
// so the normalisation cannot drift if those defaults change.
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
    ...(nextPage === PAGINATION_DEFAULT_PAGE ? {} : { page: nextPage }),
    ...(limit === PAGINATION_DEFAULT_LIMIT ? {} : { limit }),
  });
  return (
    <nav className={PAGINATION} aria-label="ページネーション">
      <span className="text-ink-tertiary text-sm">
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
