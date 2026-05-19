"use client";

import { Link } from "@tanstack/react-router";
import type { OwnedNotesResult } from "../loaders";
import { useSelection } from "./SelectionContext";

type Note = OwnedNotesResult["notes"][number];

type Props = {
  notes: readonly Note[];
  showVisibilityBadge: boolean;
};

const CHIP_BASE =
  "inline-flex items-center gap-[5px] h-7 px-3 rounded-pill text-xs";

function visibilityChipClass(v: Note["visibility"]): string {
  if (v === "public") return `${CHIP_BASE} bg-success-surface text-success`;
  if (v === "unlisted") return `${CHIP_BASE} bg-warning-surface text-warning`;
  return `${CHIP_BASE} bg-surface text-ink-tertiary`;
}

function visibilityLabel(v: Note["visibility"]): string {
  if (v === "public") return "公開";
  if (v === "unlisted") return "限定公開";
  return "非公開";
}

export function TileView({ notes, showVisibilityBadge }: Props) {
  const { state, dispatch } = useSelection();
  return (
    <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 list-none p-0 m-0">
      {notes.map((note) => {
        const checked = state.ids.has(note.id);
        return (
          <li
            key={note.id}
            data-selected={checked || undefined}
            className="relative rounded-lg border border-hairline overflow-hidden bg-bg transition-colors hover:bg-surface data-[selected]:outline data-[selected]:outline-2 data-[selected]:outline-accent data-[selected]:-outline-offset-2"
          >
            <label className="absolute top-2 left-2 z-[1] rounded-xs bg-white/85 p-[2px]">
              <input
                type="checkbox"
                aria-label={`${note.title} を選択`}
                checked={checked}
                onChange={() => dispatch({ type: "toggle", id: note.id })}
                className="block w-4 h-4 accent-accent"
              />
            </label>
            <Link
              to="/notes/$noteId"
              params={{ noteId: note.id }}
              className="block text-inherit"
            >
              <div className="aspect-[16/9] bg-surface overflow-hidden">
                {note.thumbnailUrl !== null ? (
                  <img
                    src={note.thumbnailUrl}
                    alt=""
                    className="block w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-hover)]"
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className="px-4 py-3">
                <div className="mb-[6px] text-md font-medium text-ink overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                  {note.title}
                </div>
                {note.excerpt.length > 0 ? (
                  <div className="mb-[6px] text-[13px] text-ink-secondary overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
                    {note.excerpt}
                  </div>
                ) : null}
                {showVisibilityBadge ? (
                  <div className="flex justify-end">
                    <span className={visibilityChipClass(note.visibility)}>
                      {visibilityLabel(note.visibility)}
                    </span>
                  </div>
                ) : null}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
