"use client";

import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import type { OwnedNoteFilterItem } from "../loaders";
import { groupNotesByDay } from "./listSelectors";
import { useSelection } from "./SelectionContext";

type Props =
  | Readonly<{
      kind: "filter";
      notes: readonly OwnedNoteFilterItem[];
    }>
  | Readonly<{ kind: "search" }>;

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

export function CalendarView(props: Props) {
  const { state, dispatch } = useSelection();

  // The search-result projection does not expose `updatedAt` (the field
  // is intentionally absent on `OwnedNoteSearchItem` since Issue #13).
  // Grouping by day would be impossible — fall back to a notice in that
  // mode (preserving the behavior from Issue #1 ADR-014).
  const tz =
    typeof Intl !== "undefined"
      ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC")
      : "UTC";

  // Hook must be called unconditionally; the `search` branch resolves to
  // an empty array so the grouping is a no-op. Explicit type
  // parameterization keeps the bucket's `notes[number]` carrying
  // `title` etc. instead of collapsing to the generic constraint.
  const grouped = useMemo(
    () =>
      props.kind === "filter"
        ? groupNotesByDay<OwnedNoteFilterItem>(props.notes, tz)
        : [],
    [props, tz],
  );

  if (props.kind === "search") {
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
