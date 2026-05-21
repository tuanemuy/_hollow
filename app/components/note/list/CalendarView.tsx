"use client";

import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import type { DisplayedNote } from "../loaders";
import { groupNotesByDay } from "./listSelectors";
import { useSelection } from "./SelectionContext";

type Props = Readonly<{
  notes: readonly DisplayedNote[];
}>;

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

/**
 * Calendar grouping view. Since Issue #48 both filter and search paths
 * deliver real `updatedAt` values (search materialises it via
 * `NoteRepository.findByIds`), so a single `groupNotesByDay` pipeline
 * covers both — the prior `kind === "search"` fallback notice
 * (`.issue/1/adr.md` ADR-014) is no longer necessary.
 */
export function CalendarView({ notes }: Props) {
  const { state, dispatch } = useSelection();

  const tz =
    typeof Intl !== "undefined"
      ? (Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC")
      : "UTC";

  const grouped = useMemo(
    () => groupNotesByDay<DisplayedNote>(notes, tz),
    [notes, tz],
  );

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
                  className="grid grid-cols-[auto_1fr] gap-2 px-2 py-[6px] rounded-sm transition-colors motion-reduce:transition-none hover:bg-surface data-[selected]:bg-accent-surface"
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
