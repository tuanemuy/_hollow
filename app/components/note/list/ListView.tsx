"use client";

import { Link } from "@tanstack/react-router";
import type { OwnedNoteFilterItem, OwnedNoteSearchItem } from "../loaders";
import { useSelection } from "./SelectionContext";

type Props =
  | Readonly<{
      kind: "filter";
      notes: readonly OwnedNoteFilterItem[];
      showVisibilityBadge: boolean;
    }>
  | Readonly<{
      kind: "search";
      notes: readonly OwnedNoteSearchItem[];
      showVisibilityBadge: boolean;
    }>;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

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

/**
 * Shared row renderer for both the filter and search branches. Takes the
 * `updatedAtDisplay` as a pre-computed string so the discriminated-union
 * narrowing stays at the `ListView` level (search hits don't carry
 * `updatedAt`, so the caller substitutes `—`).
 */
function NoteListRow({
  note,
  updatedAtDisplay,
  showVisibilityBadge,
}: Readonly<{
  note: OwnedNoteFilterItem | OwnedNoteSearchItem;
  updatedAtDisplay: string;
  showVisibilityBadge: boolean;
}>) {
  const { state, dispatch } = useSelection();
  const checked = state.ids.has(note.id);
  return (
    <li
      key={note.id}
      data-selected={checked || undefined}
      className="grid grid-cols-[auto_1fr_auto] items-start gap-4 px-3 py-5 border-t border-hairline transition-colors hover:bg-surface data-[selected]:bg-accent-surface"
    >
      <div className="self-start pt-1">
        <input
          type="checkbox"
          aria-label={`${note.title} を選択`}
          checked={checked}
          onChange={() => dispatch({ type: "toggle", id: note.id })}
          className="w-4 h-4 accent-accent"
        />
      </div>
      <div className="min-w-0">
        <div className="mb-1 text-base font-medium text-ink tracking-tight overflow-hidden text-ellipsis whitespace-nowrap">
          <Link
            to="/notes/$noteId"
            params={{ noteId: note.id }}
            className="text-inherit hover:text-accent"
          >
            {note.title}
          </Link>
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
          {showVisibilityBadge ? (
            <>
              <span className={visibilityChipClass(note.visibility)}>
                {visibilityLabel(note.visibility)}
              </span>
              <span className="text-hairline-strong">·</span>
            </>
          ) : null}
          <span>{updatedAtDisplay}</span>
        </div>
      </div>
      <div className="text-[13px] text-ink-tertiary whitespace-nowrap self-start mt-[3px]">
        {updatedAtDisplay}
      </div>
    </li>
  );
}

export function ListView(props: Props) {
  // Branch on the discriminant up front so each path renders a homogeneous
  // list; the row renderer is shared but the `updatedAt` projection is
  // resolved per-branch where the narrowing is tight.
  if (props.kind === "search") {
    return (
      <ul className="mt-2 list-none p-0 m-0">
        {props.notes.map((note) => (
          <NoteListRow
            key={note.id}
            note={note}
            updatedAtDisplay="—"
            showVisibilityBadge={props.showVisibilityBadge}
          />
        ))}
      </ul>
    );
  }

  return (
    <ul className="mt-2 list-none p-0 m-0">
      {props.notes.map((note) => (
        <NoteListRow
          key={note.id}
          note={note}
          updatedAtDisplay={formatDate(note.updatedAt)}
          showVisibilityBadge={props.showVisibilityBadge}
        />
      ))}
    </ul>
  );
}
