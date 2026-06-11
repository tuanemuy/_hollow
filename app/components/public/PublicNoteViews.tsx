"use client";

import { getRouteApi, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { groupNotesByDay } from "../note/list/listSelectors";
import { formatDate, formatShort } from "./formatNoteDate";
import {
  CAL_DAY_LIST,
  CAL_DAY_TITLE,
  CAL_ITEM,
  CAL_WRAP,
  NOTE_DATE,
  NOTE_META,
  NOTE_ROW,
  NOTE_SNIPPET,
  NOTE_TAGS,
  NOTE_TITLE,
  NOTE_TITLE_ROW,
  TILE_BODY,
  TILE_CARD,
  TILE_GRID,
  TILE_META,
  TILE_SNIPPET,
  TILE_TITLE,
} from "./styles";

/**
 * Read-only public listing item. A serialisable subset of the
 * `NoteListItemDTO` — the public surface never renders edit / selection
 * affordances, so the rich aggregate fields stay on the server.
 */
export type PublicNoteItem = Readonly<{
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  tagNames: readonly string[];
  updatedAt: string;
}>;

type DisplayMode = "list" | "tile" | "calendar";

const route = getRouteApi("/u/$username/");

const selectDisplay = (s: { display?: DisplayMode | undefined }): DisplayMode =>
  s.display ?? "list";

/**
 * Public profile note listing with URL-driven display mode (ADR-003 /
 * ADR-004). `display` is excluded from the route `loaderDeps`, so this
 * client island swaps layout without re-streaming the RSC. Unlike the
 * auth-side `ListView` / `TileView` / `CalendarView` (bound to
 * `getRouteApi("/_app/")` and the selection context) this is a fresh
 * read-only implementation linking to the public note route.
 */
export function PublicNoteViews({
  username,
  notes,
}: Readonly<{ username: string; notes: readonly PublicNoteItem[] }>) {
  const display = route.useSearch({ select: selectDisplay });

  if (display === "tile") {
    return <TileView username={username} notes={notes} />;
  }
  if (display === "calendar") {
    return <CalendarView username={username} notes={notes} />;
  }
  return <ListView username={username} notes={notes} />;
}

function ListView({
  username,
  notes,
}: Readonly<{ username: string; notes: readonly PublicNoteItem[] }>) {
  return (
    <>
      {notes.map((note) => (
        <Link
          key={note.id}
          to="/u/$username/$noteSlug"
          params={{ username, noteSlug: note.slug }}
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
      ))}
    </>
  );
}

function TileView({
  username,
  notes,
}: Readonly<{ username: string; notes: readonly PublicNoteItem[] }>) {
  return (
    <ul className={`${TILE_GRID} list-none p-0 m-0`}>
      {notes.map((note) => (
        <li key={note.id}>
          <Link
            to="/u/$username/$noteSlug"
            params={{ username, noteSlug: note.slug }}
            className={TILE_CARD}
          >
            <div className={TILE_BODY}>
              <div className={TILE_TITLE}>{note.title}</div>
              {note.excerpt.length > 0 ? (
                <div className={TILE_SNIPPET}>{note.excerpt}</div>
              ) : null}
              <div className={TILE_META}>
                {note.tagNames.length > 0 ? (
                  <>
                    <span className={NOTE_TAGS}>
                      {note.tagNames.map((t) => `#${t}`).join(" ")}
                    </span>
                    <span className="text-hairline-strong">·</span>
                  </>
                ) : null}
                <span>{formatDate(new Date(note.updatedAt))}</span>
              </div>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function CalendarView({
  username,
  notes,
}: Readonly<{ username: string; notes: readonly PublicNoteItem[] }>) {
  const tz =
    typeof Intl !== "undefined"
      ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC")
      : "UTC";
  const grouped = useMemo(
    () => groupNotesByDay<PublicNoteItem>(notes, tz),
    [notes, tz],
  );
  return (
    <div className={CAL_WRAP}>
      {grouped.map((bucket) => (
        <section key={bucket.dateKey}>
          <h2 className={CAL_DAY_TITLE}>{formatDay(bucket.dateKey)}</h2>
          <ul className={`${CAL_DAY_LIST} list-none p-0 m-0`}>
            {bucket.notes.map((note) => (
              <li key={note.id}>
                <Link
                  to="/u/$username/$noteSlug"
                  params={{ username, noteSlug: note.slug }}
                  className={CAL_ITEM}
                >
                  {note.title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function formatDay(dateKey: string): string {
  if (dateKey === "unknown") return "日付不明";
  const d = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateKey;
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}
