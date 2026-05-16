"use client";

import { Link } from "@tanstack/react-router";
import type { OwnedNotesResult } from "../loaders";
import { useSelection } from "./SelectionContext";

type Note = OwnedNotesResult["notes"][number];

type Props = {
  notes: readonly Note[];
  showVisibilityBadge: boolean;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

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

export function ListView({ notes, showVisibilityBadge }: Props) {
  const { state, dispatch } = useSelection();
  return (
    <ul className="note-list">
      {notes.map((note) => {
        const checked = state.ids.has(note.id);
        return (
          <li
            key={note.id}
            className={`note-row${checked ? " is-selected" : ""}`}
          >
            <div className="note-select">
              <input
                type="checkbox"
                aria-label={`${note.title} を選択`}
                checked={checked}
                onChange={() => dispatch({ type: "toggle", id: note.id })}
              />
            </div>
            <div className="note-main">
              <div className="note-title">
                <Link to="/notes/$noteId" params={{ noteId: note.id }}>
                  {note.title}
                </Link>
              </div>
              {note.excerpt.length > 0 ? (
                <div className="note-snippet">{note.excerpt}</div>
              ) : null}
              <div className="note-meta">
                {note.tagNames.length > 0 ? (
                  <>
                    <span className="note-tags">
                      {note.tagNames.map((name) => `#${name}`).join(" ")}
                    </span>
                    <span className="dot">·</span>
                  </>
                ) : null}
                {showVisibilityBadge ? (
                  <>
                    <span className={visibilityChipClass(note.visibility)}>
                      {visibilityLabel(note.visibility)}
                    </span>
                    <span className="dot">·</span>
                  </>
                ) : null}
                <span>{formatDate(note.updatedAt)}</span>
              </div>
            </div>
            <div className="note-date">{formatDate(note.updatedAt)}</div>
          </li>
        );
      })}
    </ul>
  );
}
