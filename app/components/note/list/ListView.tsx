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
 * Shared row renderer. Since Issue #48 both filter and search rows
 * carry a real `updatedAt` and the visibility chip is rendered
 * unconditionally, so the previous discriminated branch with an `—`
 * substitute and the `showVisibilityBadge` guard are gone.
 */
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
      className="grid grid-cols-[1fr_auto] data-[mode]:grid-cols-[auto_1fr_auto] items-start gap-4 px-3 py-5 transition-colors motion-reduce:transition-none hover:bg-surface data-[selected]:bg-accent-surface max-sm:px-2 max-sm:py-4 max-sm:gap-3"
    >
      {mode ? (
        <div className="self-start pt-1">
          <NoteCheckbox
            checked={checked}
            onToggle={toggle}
            label={`${note.title} を選択`}
          />
        </div>
      ) : null}
      <div className="min-w-0">
        <div className="mb-1 text-base font-medium text-ink tracking-tight overflow-hidden text-ellipsis whitespace-nowrap">
          {mode ? (
            <span className="text-inherit">{note.title}</span>
          ) : (
            <Link
              to="/notes/$noteId"
              params={{ noteId: note.id }}
              className="text-inherit hover:text-accent"
            >
              {note.title}
            </Link>
          )}
        </div>
        {note.excerpt.length > 0 ? (
          <div className="mb-[6px] text-sm text-ink-secondary leading-[1.45] overflow-hidden [display:-webkit-box] [-webkit-line-clamp:1] [-webkit-box-orient:vertical]">
            {note.excerpt}
          </div>
        ) : null}
        <div className="flex items-center gap-[10px] flex-wrap text-[13px] text-ink-tertiary">
          {note.tagNames.length > 0 ? (
            <>
              <span className="text-accent text-[13px]">
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
      <div className="text-[13px] text-ink-tertiary whitespace-nowrap self-start mt-[3px]">
        {updatedAtDisplay}
      </div>
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
