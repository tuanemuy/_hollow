"use client";

import { useRouter } from "@tanstack/react-router";
import { useId, useState, useTransition } from "react";
import { pillBtn } from "@/components/common/styles";
import type { NoteListSearch } from "../schema";
import { formatReferencingNoteChipLabel } from "./listSelectors";
import { NotePickerDialog } from "./NotePickerDialog";

const CHIP =
  "inline-flex items-center gap-[5px] h-7 px-3 rounded-pill bg-surface text-xs text-ink transition-colors motion-reduce:transition-none data-[active]:bg-accent data-[active]:text-white disabled:opacity-55 disabled:cursor-not-allowed";

const FILTER_LABEL =
  "text-xs font-medium text-ink-tertiary uppercase tracking-[0.06em]";

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
  const [pickerOpen, setPickerOpen] = useState(false);
  const fromId = useId();
  const toId = useId();

  const selected = new Set(selectedTagNames);

  // Issue #215: `noteListSearchSchema` is input-optional for `page` /
  // `limit`, so we leave them out of the navigate payload to keep the
  // URL free of default pagination. The schema fills the parsed values
  // via `.default(...)`. Existing non-default `page` / `limit` carried
  // by `prev` are preserved verbatim by the spread.

  const toggleTag = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    const arr = [...next];
    startTransition(() => {
      router.navigate({
        to: "/",
        search: (prev) => ({
          ...(prev as Partial<NoteListSearch>),
          tagNames: arr.length === 0 ? undefined : arr,
        }),
      });
    });
  };

  const updateDate = (key: "from" | "to", value: string) => {
    startTransition(() => {
      router.navigate({
        to: "/",
        search: (prev) => ({
          ...(prev as Partial<NoteListSearch>),
          [key]: value === "" ? undefined : value,
        }),
      });
    });
  };

  const updateVisibility = (value: string) => {
    startTransition(() => {
      router.navigate({
        to: "/",
        search: (prev) => ({
          ...(prev as Partial<NoteListSearch>),
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
        search: (prev) => ({
          ...(prev as Partial<NoteListSearch>),
          referencingNoteId: undefined,
        }),
      });
    });
  };

  const handlePick = (noteId: string) => {
    setPickerOpen(false);
    startTransition(() => {
      router.navigate({
        to: "/",
        // Adding a filter resets the page to the schema default. We
        // explicitly clear `page` to undefined (not 1) so the URL drops
        // any prior `?page=N`; the parsed value still defaults to 1.
        search: (prev) => ({
          ...(prev as Partial<NoteListSearch>),
          referencingNoteId: noteId,
          page: undefined,
        }),
      });
    });
  };

  const clearAll = () => {
    startTransition(() => {
      router.navigate({
        to: "/",
        search: (prev) => {
          const p = prev as Partial<NoteListSearch>;
          return {
            display: p.display,
            ...(p.q !== undefined ? { q: p.q } : {}),
          };
        },
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

  const inputSm =
    "h-[30px] px-2 rounded-md border border-hairline bg-surface text-[13px] text-ink";

  return (
    <div
      className="flex flex-wrap items-center gap-3 px-2 py-3 border-b border-hairline mb-3"
      aria-busy={isPending}
    >
      {tags.length > 0 ? (
        <div className="inline-flex items-center gap-2 flex-wrap">
          <span className={FILTER_LABEL}>タグ</span>
          <div className="inline-flex gap-1.5 flex-wrap">
            {tags.map((tag) => {
              const active = selected.has(tag.name);
              return (
                <button
                  key={tag.id}
                  type="button"
                  data-active={active || undefined}
                  className={CHIP}
                  aria-pressed={active}
                  onClick={() => toggleTag(tag.name)}
                  disabled={isPending}
                >
                  #{tag.name}
                  <span className="ml-[6px] text-[11px] text-ink-tertiary [[data-active]_&]:text-white/85">
                    {tag.noteCount}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="inline-flex items-center gap-2 flex-wrap">
        <span className={FILTER_LABEL}>期間</span>
        <div className="inline-flex items-center gap-1.5">
          <label
            htmlFor={fromId}
            className="absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)]"
          >
            開始日
          </label>
          <input
            id={fromId}
            type="date"
            value={from ?? ""}
            onChange={(e) => updateDate("from", e.target.value)}
            disabled={isPending}
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
            value={to ?? ""}
            onChange={(e) => updateDate("to", e.target.value)}
            disabled={isPending}
            className={inputSm}
          />
        </div>
      </div>

      <div className="inline-flex items-center gap-2 flex-wrap">
        <span className={FILTER_LABEL}>公開状態</span>
        <select
          value={visibility ?? ""}
          onChange={(e) => updateVisibility(e.target.value)}
          disabled={isPending}
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
        {referencingNoteId !== undefined ? (
          <span data-active className={CHIP}>
            参照中:{" "}
            {formatReferencingNoteChipLabel(
              referencingNoteId,
              referencingNoteTitle ?? null,
            )}
            <button
              type="button"
              aria-label="内部リンク参照フィルタを解除"
              onClick={clearReferencingNoteId}
              disabled={isPending}
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
            disabled={isPending}
          >
            ノートを選ぶ…
          </button>
        )}
      </div>

      {hasAnyFilter ? (
        <button
          type="button"
          className={pillBtn}
          onClick={clearAll}
          disabled={isPending}
        >
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
