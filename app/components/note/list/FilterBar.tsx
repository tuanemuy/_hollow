"use client";

import { useRouter } from "@tanstack/react-router";
import { useId, useOptimistic, useState, useTransition } from "react";
import { pillBtn } from "@/components/common/styles";
import type { NoteListSearch } from "../schema";
import { formatReferencingNoteChipLabel } from "./listSelectors";
import { NotePickerDialog } from "./NotePickerDialog";

const CHIP =
  "inline-flex items-center gap-[5px] h-[30px] px-3 rounded-pill bg-surface text-[13px] text-ink transition-colors motion-reduce:transition-none hover:bg-surface-hover data-[active]:bg-ink data-[active]:text-white";

const FILTER_LABEL =
  "text-xs font-medium text-ink-tertiary uppercase tracking-[0.06em]";

// Tags beyond this count are collapsed behind a "もっと見る" toggle so the
// facet never overflows on mobile (Issue #354).
const VISIBLE_TAG_LIMIT = 12;

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

type OptimisticFilters = Readonly<{
  tagNames: ReadonlySet<string>;
  from: string | undefined;
  to: string | undefined;
  visibility: NoteListSearch["visibility"];
  referencingNoteId: string | undefined;
}>;

type FilterAction =
  | Readonly<{ type: "toggleTag"; name: string }>
  | Readonly<{ type: "setDate"; key: "from" | "to"; value: string | undefined }>
  | Readonly<{ type: "setVisibility"; value: NoteListSearch["visibility"] }>
  | Readonly<{ type: "setReferencing"; id: string | undefined }>
  | Readonly<{ type: "clearAll" }>;

function reduceFilters(
  cur: OptimisticFilters,
  action: FilterAction,
): OptimisticFilters {
  switch (action.type) {
    case "toggleTag": {
      const next = new Set(cur.tagNames);
      if (next.has(action.name)) next.delete(action.name);
      else next.add(action.name);
      return { ...cur, tagNames: next };
    }
    case "setDate":
      return { ...cur, [action.key]: action.value };
    case "setVisibility":
      return { ...cur, visibility: action.value };
    case "setReferencing":
      return { ...cur, referencingNoteId: action.id };
    case "clearAll":
      return {
        tagNames: new Set<string>(),
        from: undefined,
        to: undefined,
        visibility: undefined,
        referencingNoteId: undefined,
      };
  }
}

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  const fromId = useId();
  const toId = useId();

  // Server-confirmed baseline. `useOptimistic` mirrors filter selections
  // into the UI synchronously while the loader round-trip is in flight,
  // then snaps back to this baseline once the navigation commits and fresh
  // props arrive (Issue #354 ADR-003).
  const baseline: OptimisticFilters = {
    tagNames: new Set(selectedTagNames),
    from,
    to,
    visibility,
    referencingNoteId,
  };
  const [optimistic, applyOptimistic] = useOptimistic(baseline, reduceFilters);

  // Wrap an optimistic patch + the URL navigation in a single transition so
  // the patched value renders immediately and the loader fetch shows as
  // pending. Controls stay enabled throughout so rapid toggles are not
  // dropped.
  const run = (
    action: FilterAction,
    nav: (prev: Partial<NoteListSearch>) => Partial<NoteListSearch>,
  ) => {
    startTransition(() => {
      applyOptimistic(action);
      router.navigate({ to: "/", search: (prev) => nav(prev) });
    });
  };

  const toggleTag = (name: string) => {
    const next = new Set(optimistic.tagNames);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    const arr = [...next];
    run({ type: "toggleTag", name }, (prev) => ({
      ...(prev as Partial<NoteListSearch>),
      tagNames: arr.length === 0 ? undefined : arr,
    }));
  };

  const updateDate = (key: "from" | "to", value: string) => {
    const v = value === "" ? undefined : value;
    run({ type: "setDate", key, value: v }, (prev) => ({
      ...(prev as Partial<NoteListSearch>),
      [key]: v,
    }));
  };

  const updateVisibility = (value: string) => {
    const v =
      value === "" ? undefined : (value as NoteListSearch["visibility"]);
    run({ type: "setVisibility", value: v }, (prev) => ({
      ...(prev as Partial<NoteListSearch>),
      visibility: v,
    }));
  };

  const clearReferencingNoteId = () => {
    run({ type: "setReferencing", id: undefined }, (prev) => ({
      ...(prev as Partial<NoteListSearch>),
      referencingNoteId: undefined,
    }));
  };

  const handlePick = (noteId: string) => {
    setPickerOpen(false);
    run({ type: "setReferencing", id: noteId }, (prev) => ({
      ...(prev as Partial<NoteListSearch>),
      referencingNoteId: noteId,
      // Adding a filter resets the page to the schema default. Clearing
      // `page` to undefined drops any prior `?page=N` from the URL.
      page: undefined,
    }));
  };

  const clearAll = () => {
    run({ type: "clearAll" }, (prev) => {
      const p = prev as Partial<NoteListSearch>;
      return {
        display: p.display,
        ...(p.q !== undefined ? { q: p.q } : {}),
      };
    });
  };

  const selected = optimistic.tagNames;
  const optimisticReferencingNoteId = optimistic.referencingNoteId;

  const hasAnyFilter =
    selected.size > 0 ||
    optimistic.from !== undefined ||
    optimistic.to !== undefined ||
    optimistic.visibility !== undefined ||
    directoryId !== undefined ||
    optimisticReferencingNoteId !== undefined;

  const inputSm =
    "h-[30px] px-2 rounded-md border border-hairline bg-surface text-[13px] text-ink max-sm:flex-1 max-sm:min-w-0";

  const visibleTags = showAllTags ? tags : tags.slice(0, VISIBLE_TAG_LIMIT);
  const hiddenTagCount = tags.length - visibleTags.length;

  return (
    <div
      className="flex flex-wrap items-center gap-3 px-2 py-3 border-b border-hairline mb-3 max-sm:gap-2"
      aria-busy={isPending}
    >
      {tags.length > 0 ? (
        <div className="inline-flex items-center gap-2 flex-wrap">
          <span className={FILTER_LABEL}>タグ</span>
          <div className="inline-flex gap-1.5 flex-wrap">
            {visibleTags.map((tag) => {
              const active = selected.has(tag.name);
              return (
                <button
                  key={tag.id}
                  type="button"
                  data-active={active || undefined}
                  className={CHIP}
                  aria-pressed={active}
                  onClick={() => toggleTag(tag.name)}
                >
                  #{tag.name}
                  <span className="ml-[6px] text-[11px] text-ink-tertiary [[data-active]_&]:text-white/85">
                    {tag.noteCount}
                  </span>
                </button>
              );
            })}
            {tags.length > VISIBLE_TAG_LIMIT ? (
              <button
                type="button"
                className={CHIP}
                aria-expanded={showAllTags}
                onClick={() => setShowAllTags((v) => !v)}
              >
                {showAllTags ? "閉じる" : `もっと見る (+${hiddenTagCount})`}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="inline-flex items-center gap-2 flex-wrap max-sm:w-full">
        <span className={FILTER_LABEL}>期間</span>
        <div className="inline-flex items-center gap-1.5 max-sm:flex-1">
          <label
            htmlFor={fromId}
            className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)]"
          >
            開始日
          </label>
          <input
            id={fromId}
            type="date"
            value={optimistic.from ?? ""}
            onChange={(e) => updateDate("from", e.target.value)}
            className={inputSm}
          />
          <span aria-hidden="true">–</span>
          <label
            htmlFor={toId}
            className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)]"
          >
            終了日
          </label>
          <input
            id={toId}
            type="date"
            value={optimistic.to ?? ""}
            onChange={(e) => updateDate("to", e.target.value)}
            className={inputSm}
          />
        </div>
      </div>

      <div className="inline-flex items-center gap-2 flex-wrap">
        <span className={FILTER_LABEL}>公開状態</span>
        <select
          value={optimistic.visibility ?? ""}
          onChange={(e) => updateVisibility(e.target.value)}
          aria-label="公開状態フィルタ"
          className={inputSm}
        >
          <option value="">すべて</option>
          <option value="private">非公開</option>
          <option value="unlisted">限定公開</option>
          <option value="public">公開</option>
        </select>
      </div>

      <div className="inline-flex items-center gap-2 flex-wrap">
        <span className={FILTER_LABEL}>内部リンク参照</span>
        {optimisticReferencingNoteId !== undefined ? (
          <span data-active className={CHIP}>
            参照中:{" "}
            {formatReferencingNoteChipLabel(
              optimisticReferencingNoteId,
              optimisticReferencingNoteId === referencingNoteId
                ? (referencingNoteTitle ?? null)
                : null,
            )}
            <button
              type="button"
              aria-label="内部リンク参照フィルタを解除"
              onClick={clearReferencingNoteId}
              className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-white/85 hover:text-white"
            >
              ×
            </button>
          </span>
        ) : (
          <button
            type="button"
            className={pillBtn}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen(true)}
          >
            ノートを選ぶ…
          </button>
        )}
      </div>

      {hasAnyFilter ? (
        <button type="button" className={pillBtn} onClick={clearAll}>
          クリア
        </button>
      ) : null}

      <NotePickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePick}
        isPending={isPending}
      />
    </div>
  );
}
