"use client";

import { Link } from "@tanstack/react-router";
import type { DisplayedNote } from "../loaders";
import { formatDate } from "./listSelectors";
import { NoteCheckbox } from "./NoteCheckbox";
import { useSelection } from "./SelectionContext";
import { visibilityChipClass, visibilityLabel } from "./styles";

type Props = Readonly<{
  notes: readonly DisplayedNote[];
}>;

/**
 * Shared row renderer. Both filter and search rows carry a real
 * `updatedAt` and the visibility chip is rendered unconditionally, so no
 * discriminated branch or visibility guard is needed.
 */
/**
 * Row body shared by the unselected `<Link>` and the selection-mode
 * `<button>`. Both wrappers are `grid grid-cols-[1fr_auto]` containers, so
 * the main column and the right-aligned date cell are rendered as their
 * direct children here.
 */
function NoteListRowBody({
  note,
  updatedAtDisplay,
}: Readonly<{
  note: DisplayedNote;
  updatedAtDisplay: string;
}>) {
  return (
    <>
      <div className="min-w-0">
        <div className="mb-1 text-base font-medium text-ink tracking-tight overflow-hidden text-ellipsis whitespace-nowrap">
          {note.title}
        </div>
        {note.excerpt.length > 0 ? (
          <div className="mb-[6px] text-sm text-ink-secondary leading-[1.45] overflow-hidden [display:-webkit-box] [-webkit-line-clamp:1] [-webkit-box-orient:vertical]">
            {note.excerpt}
          </div>
        ) : null}
        <div className="flex items-center gap-[10px] flex-wrap text-sm text-ink-tertiary">
          {note.tagNames.length > 0 ? (
            <>
              <span className="text-accent text-sm">
                {note.tagNames.map((name) => `#${name}`).join(" ")}
              </span>
              <span className="text-hairline-strong">·</span>
            </>
          ) : null}
          <span className={visibilityChipClass(note.visibility)}>
            {visibilityLabel(note.visibility)}
          </span>
        </div>
      </div>
      <div className="text-sm text-ink-tertiary whitespace-nowrap self-start mt-[3px]">
        {updatedAtDisplay}
      </div>
    </>
  );
}

function NoteListRow({
  note,
}: Readonly<{
  note: DisplayedNote;
}>) {
  const { state, dispatch } = useSelection();
  const checked = state.ids.has(note.id);
  const mode = state.mode;
  const updatedAtDisplay = formatDate(note.updatedAt);
  const toggle = () => dispatch({ type: "toggle", id: note.id });
  return (
    <li
      key={note.id}
      data-selected={checked || undefined}
      data-mode={mode || undefined}
      className="transition-colors motion-reduce:transition-none hover:bg-surface data-[selected]:bg-accent-surface data-[mode]:grid data-[mode]:grid-cols-[auto_1fr] data-[mode]:items-start data-[mode]:gap-4 data-[mode]:px-3 data-[mode]:py-5 data-[mode]:max-sm:px-2 data-[mode]:max-sm:py-4 data-[mode]:max-sm:gap-3"
    >
      {mode ? (
        <>
          <div className="self-start pt-1">
            <NoteCheckbox
              checked={checked}
              onToggle={toggle}
              label={`${note.title} を選択`}
            />
          </div>
          <button
            type="button"
            onClick={toggle}
            className="grid grid-cols-[1fr_auto] items-start gap-4 w-full text-left text-inherit cursor-pointer"
          >
            <NoteListRowBody note={note} updatedAtDisplay={updatedAtDisplay} />
          </button>
        </>
      ) : (
        <Link
          to="/notes/$noteId"
          params={{ noteId: note.id }}
          aria-label={note.title}
          className="grid grid-cols-[1fr_auto] items-start gap-4 px-3 py-5 max-sm:px-2 max-sm:py-4 max-sm:gap-3 text-inherit"
        >
          <NoteListRowBody note={note} updatedAtDisplay={updatedAtDisplay} />
        </Link>
      )}
    </li>
  );
}

export function ListView({ notes }: Props) {
  return (
    <ul className="mt-2 list-none p-0 m-0 divide-y divide-hairline">
      {notes.map((note) => (
        <NoteListRow key={note.id} note={note} />
      ))}
    </ul>
  );
}
