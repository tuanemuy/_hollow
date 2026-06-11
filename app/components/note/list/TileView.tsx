"use client";

import { Link } from "@tanstack/react-router";
import type { DisplayedNote } from "../loaders";
import { formatDate } from "./listSelectors";
import { NoteCheckbox } from "./NoteCheckbox";
import { useSelection } from "./SelectionContext";
import { visibilityChipClass, visibilityLabel } from "./styles";

type Props = {
  notes: readonly DisplayedNote[];
};

function TileBody({ note }: Readonly<{ note: DisplayedNote }>) {
  return (
    <div className="px-4 py-3">
      <div className="mb-[6px] text-md font-medium text-ink overflow-hidden text-ellipsis [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
        {note.title}
      </div>
      {note.excerpt.length > 0 ? (
        <div className="mb-[6px] text-sm text-ink-secondary overflow-hidden [display:-webkit-box] [-webkit-line-clamp:2] [-webkit-box-orient:vertical]">
          {note.excerpt}
        </div>
      ) : null}
      <div className="flex items-center gap-[10px] flex-wrap text-sm text-ink-tertiary">
        {note.tagNames.length > 0 ? (
          <>
            <span className="text-accent text-sm min-w-0 [overflow-wrap:anywhere]">
              {note.tagNames.map((name) => `#${name}`).join(" ")}
            </span>
            <span className="text-hairline-strong">·</span>
          </>
        ) : null}
        <span className={visibilityChipClass(note.visibility)}>
          {visibilityLabel(note.visibility)}
        </span>
        <span className="text-hairline-strong">·</span>
        <span>{formatDate(note.updatedAt)}</span>
      </div>
    </div>
  );
}

export function TileView({ notes }: Props) {
  const { state, dispatch } = useSelection();
  const mode = state.mode;
  return (
    <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 list-none p-0 m-0">
      {notes.map((note) => {
        const checked = state.ids.has(note.id);
        // Dim the tile while a bulk trash over the current selection is in
        // flight (#635 ADR-002).
        const pending = state.pendingBulk && checked;
        const toggle = () => dispatch({ type: "toggle", id: note.id });
        return (
          <li
            key={note.id}
            data-selected={checked || undefined}
            data-pending={pending || undefined}
            aria-busy={pending || undefined}
            className="relative rounded-lg border border-hairline overflow-hidden bg-bg transition-[color,background-color,opacity] motion-reduce:transition-none hover:bg-surface data-[selected]:outline data-[selected]:outline-2 data-[selected]:outline-accent data-[selected]:-outline-offset-2 data-[pending]:opacity-60"
          >
            {mode ? (
              <span className="absolute top-2 left-2 z-[1] rounded-full bg-white/85 p-[2px]">
                <NoteCheckbox
                  checked={checked}
                  onToggle={toggle}
                  label={`${note.title} を選択`}
                />
              </span>
            ) : null}
            {mode ? (
              <button
                type="button"
                onClick={toggle}
                className="block w-full text-left text-inherit cursor-pointer"
              >
                <TileBody note={note} />
              </button>
            ) : (
              <Link
                to="/notes/$noteId"
                params={{ noteId: note.id }}
                className="block text-inherit"
              >
                <TileBody note={note} />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
