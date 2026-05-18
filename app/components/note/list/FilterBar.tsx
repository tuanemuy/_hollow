"use client";

import { useRouter } from "@tanstack/react-router";
import { useId, useTransition } from "react";
import type { NoteListSearch } from "../schema";
import { formatReferencingNoteChipLabel } from "./listSelectors";

type TagOption = Readonly<{ id: string; name: string; noteCount: number }>;

type Props = {
  tags: readonly TagOption[];
  selectedTagNames: readonly string[];
  from: string | undefined;
  to: string | undefined;
  visibility: NoteListSearch["visibility"];
  directoryId: string | undefined;
  referencingNoteId: string | undefined;
  referencingNoteTitle?: string | null;
};

export function FilterBar({
  tags,
  selectedTagNames,
  from,
  to,
  visibility,
  directoryId,
  referencingNoteId,
  referencingNoteTitle,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const fromId = useId();
  const toId = useId();

  const selected = new Set(selectedTagNames);

  const toggleTag = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    const arr = [...next];
    startTransition(() => {
      router.navigate({
        to: "/",
        search: (prev: NoteListSearch) => ({
          ...prev,
          tagNames: arr.length === 0 ? undefined : arr,
        }),
      });
    });
  };

  const updateDate = (key: "from" | "to", value: string) => {
    startTransition(() => {
      router.navigate({
        to: "/",
        search: (prev: NoteListSearch) => ({
          ...prev,
          [key]: value === "" ? undefined : value,
        }),
      });
    });
  };

  const updateVisibility = (value: string) => {
    startTransition(() => {
      router.navigate({
        to: "/",
        search: (prev: NoteListSearch) => ({
          ...prev,
          visibility:
            value === "" ? undefined : (value as NoteListSearch["visibility"]),
        }),
      });
    });
  };

  const clearReferencingNoteId = () => {
    startTransition(() => {
      router.navigate({
        to: "/",
        search: (prev: NoteListSearch) => ({
          ...prev,
          referencingNoteId: undefined,
        }),
      });
    });
  };

  const clearAll = () => {
    startTransition(() => {
      router.navigate({
        to: "/",
        search: (prev: NoteListSearch) => ({
          display: prev.display,
          page: prev.page,
          limit: prev.limit,
          ...(prev.q !== undefined ? { q: prev.q } : {}),
        }),
      });
    });
  };

  const hasAnyFilter =
    selectedTagNames.length > 0 ||
    from !== undefined ||
    to !== undefined ||
    visibility !== undefined ||
    directoryId !== undefined ||
    referencingNoteId !== undefined;

  return (
    <div className="filter-bar" aria-busy={isPending}>
      {tags.length > 0 ? (
        <div className="filter-bar-row">
          <span className="filter-bar-label">タグ</span>
          <div className="filter-bar-chips">
            {tags.map((tag) => {
              const active = selected.has(tag.name);
              return (
                <button
                  key={tag.id}
                  type="button"
                  className={`chip${active ? " chip-active" : ""}`}
                  aria-pressed={active}
                  onClick={() => toggleTag(tag.name)}
                  disabled={isPending}
                >
                  #{tag.name}
                  <span className="chip-count">{tag.noteCount}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="filter-bar-row">
        <span className="filter-bar-label">期間</span>
        <div className="filter-bar-dates">
          <label htmlFor={fromId} className="sr-only">
            開始日
          </label>
          <input
            id={fromId}
            type="date"
            value={from ?? ""}
            onChange={(e) => updateDate("from", e.target.value)}
            disabled={isPending}
          />
          <span aria-hidden="true">–</span>
          <label htmlFor={toId} className="sr-only">
            終了日
          </label>
          <input
            id={toId}
            type="date"
            value={to ?? ""}
            onChange={(e) => updateDate("to", e.target.value)}
            disabled={isPending}
          />
        </div>
      </div>

      <div className="filter-bar-row">
        <span className="filter-bar-label">公開状態</span>
        <select
          value={visibility ?? ""}
          onChange={(e) => updateVisibility(e.target.value)}
          disabled={isPending}
          aria-label="公開状態フィルタ"
        >
          <option value="">すべて</option>
          <option value="private">非公開</option>
          <option value="unlisted">限定公開</option>
          <option value="public">公開</option>
        </select>
      </div>

      {referencingNoteId !== undefined ? (
        <div className="filter-bar-row">
          <span className="filter-bar-label">内部リンク参照</span>
          <span className="chip chip-active">
            参照中:{" "}
            {formatReferencingNoteChipLabel(
              referencingNoteId,
              referencingNoteTitle ?? null,
            )}
            <button
              type="button"
              className="chip-remove"
              aria-label="内部リンク参照フィルタを解除"
              onClick={clearReferencingNoteId}
              disabled={isPending}
            >
              ×
            </button>
          </span>
        </div>
      ) : null}

      {hasAnyFilter ? (
        <button
          type="button"
          className="pill-btn"
          onClick={clearAll}
          disabled={isPending}
        >
          クリア
        </button>
      ) : null}
    </div>
  );
}
