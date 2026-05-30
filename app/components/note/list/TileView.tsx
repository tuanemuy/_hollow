"use client";

import { Link } from "@tanstack/react-router";
import type { DisplayedNote, OwnedNoteFilterItem } from "../loaders";
import { NoteCheckbox } from "./NoteCheckbox";
import { useSelection } from "./SelectionContext";

type Props = {
  notes: readonly DisplayedNote[];
};

const CHIP_BASE =
  "inline-flex items-center gap-[5px] h-7 px-3 rounded-pill text-xs";

type Visibility = OwnedNoteFilterItem["visibility"];

function visibilityChipClass(v: Visibility): string {
  if (v === "public") return `${CHIP_BASE} bg-success-surface text-success`;
  if (v === "unlisted") return `${CHIP_BASE} bg-warning-surface text-warning`;
  return `${CHIP_BASE} bg-surface text-ink-tertiary`;
}

function visibilityLabel(v: Visibility): string {
  if (v === "public") return "公開";
  if (v === "unlisted") return "限定公開";
  return "非公開";
}

function TileBody({ note }: Readonly<{ note: DisplayedNote }>) {
  return (
    <>
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
        <div className="flex justify-end">
          <span className={visibilityChipClass(note.visibility)}>
            {visibilityLabel(note.visibility)}
          </span>
        </div>
      </div>
    </>
  );
}

export function TileView({ notes }: Props) {
  const { state, dispatch } = useSelection();
  const mode = state.mode;
  return (
    <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4 list-none p-0 m-0">
      {notes.map((note) => {
        const checked = state.ids.has(note.id);
        const toggle = () => dispatch({ type: "toggle", id: note.id });
        return (
          <li
            key={note.id}
            data-selected={checked || undefined}
            className="relative rounded-lg border border-hairline overflow-hidden bg-bg transition-colors motion-reduce:transition-none hover:bg-surface data-[selected]:outline data-[selected]:outline-2 data-[selected]:outline-accent data-[selected]:-outline-offset-2"
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
