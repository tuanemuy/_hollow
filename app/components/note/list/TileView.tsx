"use client";

import { Link } from "@tanstack/react-router";
import type { OwnedNotesResult } from "../loaders";
import { useSelection } from "./SelectionContext";

type Note = OwnedNotesResult["notes"][number];

type Props = {
  notes: readonly Note[];
  showVisibilityBadge: boolean;
};

function visibilityChipClass(v: Note["visibility"]): string {
  if (v === "public") return "chip public";
  if (v === "unlisted") return "chip unlisted";
  return "chip private";
}

function visibilityLabel(v: Note["visibility"]): string {
  if (v === "public") return "公開";
  if (v === "unlisted") return "限定公開";
  return "非公開";
}

export function TileView({ notes, showVisibilityBadge }: Props) {
  const { state, dispatch } = useSelection();
  return (
    <ul className="note-grid">
      {notes.map((note) => {
        const checked = state.ids.has(note.id);
        return (
          <li
            key={note.id}
            className={`note-tile${checked ? " is-selected" : ""}`}
          >
            <label className="note-tile-select">
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
              className="note-tile-link"
            >
              <div className="note-tile-thumb">
                {note.thumbnailUrl !== null ? (
                  <img src={note.thumbnailUrl} alt="" />
                ) : (
                  <div className="note-tile-thumb-empty" aria-hidden="true" />
                )}
              </div>
              <div className="note-tile-body">
                <div className="note-tile-title">{note.title}</div>
                {note.excerpt.length > 0 ? (
                  <div className="note-tile-excerpt">{note.excerpt}</div>
                ) : null}
                {showVisibilityBadge ? (
                  <div className="note-tile-foot">
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
