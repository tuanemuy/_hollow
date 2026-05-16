import { Link, notFound } from "@tanstack/react-router";
import { cache } from "react";
import { isNotFoundError } from "@/core/application/errors";
import { serverData } from "@/core/presentation/serverAction";
import { avatarInitials, PublicLayout, SearchIcon } from "./PublicLayout";

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
      <main className="public-main">
        <section className="profile-hero">
          <div className="profile-avatar" aria-hidden="true">
            {initials}
          </div>
          <div className="profile-info">
            <h1 className="profile-name">{user.displayName}</h1>
            <div className="profile-username">@{user.username}</div>
            {user.bio !== null && user.bio.length > 0 ? (
              <p className="profile-bio">{user.bio}</p>
            ) : null}
            <div className="profile-stats">
              <span>
                <strong>{publicNoteCount}</strong>公開ノート
              </span>
              <span className="dot">·</span>
              <span>{joinedLabel}から</span>
            </div>
          </div>
        </section>

        <section className="user-tools">
          <search className="user-search">
            <form method="get" action="/search">
              <SearchIcon />
              <label
                htmlFor={`user-search-${user.username}`}
                className="visually-hidden"
              >
                このユーザーの公開ノートを検索
              </label>
              <input
                id={`user-search-${user.username}`}
                type="search"
                name="q"
                placeholder="このユーザーの公開ノートを検索"
              />
              <input type="hidden" name="username" value={user.username} />
            </form>
          </search>
        </section>

        <section className="note-list" aria-label="公開ノート一覧">
          {notes.length === 0 ? (
            <div className="empty-list">
              公開されているノートはまだありません。
            </div>
          ) : (
            notes.map((note) => (
              <Link
                key={note.id}
                to="/u/$username/$noteSlug"
                params={{ username: user.username, noteSlug: note.slug }}
                className="note-row"
              >
                <div className="note-main">
                  <div className="note-title-row">
                    <div className="note-title">{note.title}</div>
                  </div>
                  {note.excerpt.length > 0 ? (
                    <div className="note-snippet">{note.excerpt}</div>
                  ) : null}
                  <div className="note-meta">
                    {note.tagNames.length > 0 ? (
                      <span className="note-tags">
                        {note.tagNames.map((t) => `#${t}`).join(" ")}
                      </span>
                    ) : null}
                    <span>{formatDate(new Date(note.updatedAt))}</span>
                  </div>
                </div>
                <div className="note-date">
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
  return (
    <nav className="pagination" aria-label="ページネーション">
      <span className="pagination-info">
        {page} / {totalPages}
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        {page > 1 ? (
          <Link
            to="/u/$username"
            params={{ username }}
            search={{ page: page - 1, limit }}
            className="pill-btn"
          >
            前へ
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link
            to="/u/$username"
            params={{ username }}
            search={{ page: page + 1, limit }}
            className="pill-btn"
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
