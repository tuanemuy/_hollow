"use client";

import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import type { OwnedNotesResult } from "../loaders";
import { groupNotesByDay } from "./listSelectors";
import { useSelection } from "./SelectionContext";

type Note = OwnedNotesResult["notes"][number];

type Props = {
  notes: readonly Note[];
  mode: "filter" | "search";
};

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

export function CalendarView({ notes, mode }: Props) {
  const { state, dispatch } = useSelection();

  // The search-result projection currently flattens `updatedAt` to the
  // epoch (see ADR-012). Grouping that into a calendar would be misleading
  // — fall back to the list rendering in that mode.
  const tz =
    typeof Intl !== "undefined"
      ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC")
      : "UTC";

  const grouped = useMemo(() => groupNotesByDay(notes, tz), [notes, tz]);

  if (mode === "search") {
    return (
      <div className="calendar-fallback">
        <p>
          検索結果はカレンダー表示に対応していません。リスト表示で結果をご確認ください。
        </p>
      </div>
    );
  }

  return (
    <div className="calendar-grid">
      {grouped.map((bucket) => (
        <section key={bucket.dateKey} className="calendar-bucket">
          <h2 className="calendar-bucket-head">{formatDay(bucket.dateKey)}</h2>
          <ul className="calendar-bucket-notes">
            {bucket.notes.map((note) => {
              const checked = state.ids.has(note.id);
              return (
                <li
                  key={note.id}
                  className={`calendar-note${checked ? " is-selected" : ""}`}
                >
                  <label className="calendar-note-select">
                    <input
                      type="checkbox"
                      aria-label={`${note.title} を選択`}
                      checked={checked}
                      onChange={() => dispatch({ type: "toggle", id: note.id })}
                    />
                  </label>
                  <Link
                    to="/notes/$noteId"
                    params={{ noteId: note.id }}
                    className="calendar-note-title"
                  >
                    {note.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
