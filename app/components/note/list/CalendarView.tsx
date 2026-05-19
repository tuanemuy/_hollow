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
      <div className="mt-3 rounded-md bg-surface p-4 text-sm text-ink-secondary">
        <p>
          検索結果はカレンダー表示に対応していません。リスト表示で結果をご確認ください。
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-5">
      {grouped.map((bucket) => (
        <section key={bucket.dateKey}>
          <h2 className="mb-2 pb-2 border-b border-hairline text-[13px] font-medium text-ink-secondary">
            {formatDay(bucket.dateKey)}
          </h2>
          <ul className="flex flex-col gap-1 list-none p-0 m-0">
            {bucket.notes.map((note) => {
              const checked = state.ids.has(note.id);
              return (
                <li
                  key={note.id}
                  data-selected={checked || undefined}
                  className="grid grid-cols-[auto_1fr] gap-2 px-2 py-[6px] rounded-sm transition-colors hover:bg-surface data-[selected]:bg-accent-surface"
                >
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`${note.title} を選択`}
                      checked={checked}
                      onChange={() => dispatch({ type: "toggle", id: note.id })}
                      className="w-[14px] h-[14px] accent-accent"
                    />
                  </label>
                  <Link
                    to="/notes/$noteId"
                    params={{ noteId: note.id }}
                    className="text-sm text-ink hover:text-accent"
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
