"use client";

import { useRouter } from "@tanstack/react-router";
import { useId, useOptimistic, useRef, useState, useTransition } from "react";
import { Popover } from "@/components/common/Popover";
import { pillBtn } from "@/components/common/styles";
import { useRovingMenu } from "@/components/common/useRovingMenu";
import type { NoteListSearch } from "../schema";
import { homeSearchUpdater } from "./homeSearch";
import {
  DATE_RANGE_PRESETS,
  type DateRangePreset,
  dateRangePresetLabels,
  formatDateRangeChipLabel,
  formatReferencingNoteChipLabel,
  matchDateRangePreset,
  resolveDateRangePreset,
} from "./listSelectors";
import { NotePickerDialog } from "./NotePickerDialog";
import {
  filterChip,
  filterChipCaret,
  filterChipGhost,
  filterChipRemove,
  filterLabel,
  visibilityLabel,
  visibilitySwatchClass,
} from "./styles";

// Tags beyond this count are collapsed behind a "もっと見る" toggle so the
// facet never overflows on mobile (Issue #354).
const VISIBLE_TAG_LIMIT = 12;

type Visibility = NoteListSearch["visibility"];
type VisibilityValue = NonNullable<Visibility>;
type VisibilityOption = VisibilityValue | "all";
const VISIBILITY_OPTIONS: readonly VisibilityOption[] = [
  "all",
  "private",
  "unlisted",
  "public",
];

type TagOption = Readonly<{ id: string; name: string; noteCount: number }>;

type Props = {
  tags: readonly TagOption[];
  selectedTagNames: readonly string[];
  from: string | undefined;
  to: string | undefined;
  visibility: Visibility;
  directoryId: string | undefined;
  directoryName?: string;
  referencingNoteId: string | undefined;
  referencingNoteTitle?: string | null;
};

type OptimisticFilters = Readonly<{
  tagNames: ReadonlySet<string>;
  from: string | undefined;
  to: string | undefined;
  visibility: Visibility;
  directoryId: string | undefined;
  referencingNoteId: string | undefined;
}>;

type FilterAction =
  | Readonly<{ type: "toggleTag"; name: string }>
  | Readonly<{
      type: "setDateRange";
      from: string | undefined;
      to: string | undefined;
    }>
  | Readonly<{ type: "setDate"; key: "from" | "to"; value: string | undefined }>
  | Readonly<{ type: "setVisibility"; value: Visibility }>
  | Readonly<{ type: "setReferencing"; id: string | undefined }>
  | Readonly<{ type: "clearDirectory" }>
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
    case "setDateRange":
      return { ...cur, from: action.from, to: action.to };
    case "setDate":
      return { ...cur, [action.key]: action.value };
    case "setVisibility":
      return { ...cur, visibility: action.value };
    case "setReferencing":
      return { ...cur, referencingNoteId: action.id };
    case "clearDirectory":
      return { ...cur, directoryId: undefined };
    case "clearAll":
      return {
        tagNames: new Set<string>(),
        from: undefined,
        to: undefined,
        visibility: undefined,
        directoryId: undefined,
        referencingNoteId: undefined,
      };
    default: {
      // Exhaustiveness guard: a new FilterAction variant breaks the build here
      // until it is handled above.
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function FilterBar({
  tags,
  selectedTagNames,
  from,
  to,
  visibility,
  directoryId,
  directoryName,
  referencingNoteId,
  referencingNoteTitle,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showAllTags, setShowAllTags] = useState(false);
  // Mutually-exclusive popover state: opening one closes the other (#476).
  const [openPopover, setOpenPopover] = useState<"date" | "visibility" | null>(
    null,
  );
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
    directoryId,
    referencingNoteId,
  };
  const [optimistic, applyOptimistic] = useOptimistic(baseline, reduceFilters);

  // Wrap an optimistic patch + the URL navigation in a single transition so
  // the patched value renders immediately and the loader fetch shows as
  // pending. The navigation (loader round-trip included) is awaited inside
  // the transition so it stays pending until the fresh props commit —
  // otherwise the transition ends synchronously and `useOptimistic` snaps
  // back to baseline before the selection is reflected (Issue #478). The
  // await is wrapped so a rejected/cancelled navigation still settles the
  // transition cleanly, letting `useOptimistic` revert to the server-
  // confirmed baseline; a failed filter nav has no error surface of its own.
  // Controls stay enabled throughout so rapid toggles are not dropped.
  const run = (
    action: FilterAction,
    nav: (prev: Partial<NoteListSearch>) => Partial<NoteListSearch>,
  ) => {
    startTransition(async () => {
      applyOptimistic(action);
      try {
        await router.navigate({ to: "/", search: (prev) => nav(prev) });
      } catch {
        // Reverting to baseline is the correct fallback for a filter toggle.
      }
    });
  };

  const toggleTag = (name: string) => {
    const next = new Set(optimistic.tagNames);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    const arr = [...next];
    run({ type: "toggleTag", name }, (prev) =>
      homeSearchUpdater(prev, {
        tagNames: arr.length === 0 ? undefined : arr,
      }),
    );
  };

  // Adding / changing a filter resets pagination to page 1 (drops any prior
  // `?page=N`), matching `handlePick`'s existing behaviour (#476 page rule).
  const applyDateRange = (
    nextFrom: string | undefined,
    nextTo: string | undefined,
  ) => {
    run({ type: "setDateRange", from: nextFrom, to: nextTo }, (prev) =>
      homeSearchUpdater(prev, {
        from: nextFrom,
        to: nextTo,
        page: undefined,
      }),
    );
  };

  const updateDate = (key: "from" | "to", value: string) => {
    const v = value === "" ? undefined : value;
    run({ type: "setDate", key, value: v }, (prev) =>
      homeSearchUpdater(prev, { [key]: v, page: undefined }),
    );
  };

  const selectPreset = (preset: DateRangePreset) => {
    const { from: f, to: t } = resolveDateRangePreset(preset, new Date());
    applyDateRange(f, t);
  };

  const clearDateRange = () => applyDateRange(undefined, undefined);

  const selectVisibility = (value: VisibilityOption) => {
    const v: Visibility = value === "all" ? undefined : value;
    setOpenPopover(null);
    run({ type: "setVisibility", value: v }, (prev) =>
      homeSearchUpdater(prev, { visibility: v, page: undefined }),
    );
  };

  const clearVisibility = () => {
    run({ type: "setVisibility", value: undefined }, (prev) =>
      homeSearchUpdater(prev, { visibility: undefined, page: undefined }),
    );
  };

  const clearReferencingNoteId = () => {
    run({ type: "setReferencing", id: undefined }, (prev) =>
      homeSearchUpdater(prev, {
        referencingNoteId: undefined,
        page: undefined,
      }),
    );
  };

  const clearDirectory = () => {
    run({ type: "clearDirectory" }, (prev) =>
      homeSearchUpdater(prev, { directoryId: undefined, page: undefined }),
    );
  };

  const handlePick = (noteId: string) => {
    setPickerOpen(false);
    run({ type: "setReferencing", id: noteId }, (prev) =>
      homeSearchUpdater(prev, {
        referencingNoteId: noteId,
        // Adding a filter resets the page to the schema default. Clearing
        // `page` to undefined drops any prior `?page=N` from the URL.
        page: undefined,
      }),
    );
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
  const optimisticDirectoryId = optimistic.directoryId;
  const optimisticFrom = optimistic.from;
  const optimisticTo = optimistic.to;
  const optimisticVisibility = optimistic.visibility;

  const hasDateRange =
    optimisticFrom !== undefined || optimisticTo !== undefined;
  const dateChipLabel = formatDateRangeChipLabel(optimisticFrom, optimisticTo);
  const selectedPreset = matchDateRangePreset(
    optimisticFrom,
    optimisticTo,
    new Date(),
  );

  const hasAnyFilter =
    selected.size > 0 ||
    hasDateRange ||
    optimisticVisibility !== undefined ||
    optimisticDirectoryId !== undefined ||
    optimisticReferencingNoteId !== undefined;

  const visibleTags = showAllTags ? tags : tags.slice(0, VISIBLE_TAG_LIMIT);
  const hiddenTagCount = tags.length - visibleTags.length;

  return (
    <div
      className="flex flex-wrap items-center gap-3 px-2 py-3 border-b border-hairline mb-3 max-sm:gap-2"
      aria-busy={isPending}
    >
      {tags.length > 0 ? (
        <div className="inline-flex gap-1.5 flex-wrap">
          {visibleTags.map((tag) => {
            const active = selected.has(tag.name);
            return (
              <button
                key={tag.id}
                type="button"
                data-active={active || undefined}
                className={filterChip}
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
              className={filterChipGhost}
              aria-expanded={showAllTags}
              onClick={() => setShowAllTags((v) => !v)}
            >
              {showAllTags ? "閉じる" : `もっと見る (+${hiddenTagCount})`}
            </button>
          ) : null}
        </div>
      ) : null}

      <DatePopover
        fromId={fromId}
        toId={toId}
        from={optimisticFrom}
        to={optimisticTo}
        chipLabel={dateChipLabel}
        selectedPreset={selectedPreset}
        open={openPopover === "date"}
        onOpenChange={(next) => setOpenPopover(next ? "date" : null)}
        onSelectPreset={selectPreset}
        onChangeDate={updateDate}
        onClear={clearDateRange}
      />

      <VisibilityPopover
        value={optimisticVisibility}
        open={openPopover === "visibility"}
        onOpenChange={(next) => setOpenPopover(next ? "visibility" : null)}
        onSelect={selectVisibility}
        onClear={clearVisibility}
      />

      {optimisticDirectoryId !== undefined ? (
        <span data-active className={filterChip}>
          {optimisticDirectoryId === directoryId
            ? directoryName || "ディレクトリ"
            : "ディレクトリ"}
          <button
            type="button"
            aria-label="ディレクトリフィルタを解除"
            onClick={clearDirectory}
            className={filterChipRemove}
          >
            ×
          </button>
        </span>
      ) : null}

      {optimisticReferencingNoteId !== undefined ? (
        <span data-active className={filterChip}>
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
            className={filterChipRemove}
          >
            ×
          </button>
        </span>
      ) : (
        <button
          type="button"
          className={filterChipGhost}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen(true)}
        >
          内部リンク参照
          <span className={filterChipCaret} aria-hidden="true">
            ▾
          </span>
        </button>
      )}

      {hasAnyFilter ? (
        <button
          type="button"
          className={`${pillBtn} max-sm:ml-0 ml-auto`}
          onClick={clearAll}
        >
          すべてクリア
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

type DatePopoverProps = Readonly<{
  fromId: string;
  toId: string;
  from: string | undefined;
  to: string | undefined;
  chipLabel: string | null;
  selectedPreset: DateRangePreset | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSelectPreset: (preset: DateRangePreset) => void;
  onChangeDate: (key: "from" | "to", value: string) => void;
  onClear: () => void;
}>;

// `left-0` anchors the panel to the trigger's left edge; the `<Popover>`
// `clampToViewport` then nudges it horizontally into the viewport (`shiftX`).
// Anchoring alone breaks because FilterBar triggers sit anywhere in a wrapping
// row — a fixed `left-0`/`right-0` overflows one side or the other depending
// on the trigger's position (#476). The fixed `w-[280px]` (rather than
// `w-max`) keeps the native `<input type="date">` children from ballooning the
// panel to their huge intrinsic `max-content` width; `max-w` still caps it on
// narrow viewports (#476).
const FILTER_POPOVER_PANEL =
  "absolute left-0 top-full mt-2 z-40 rounded-lg border border-hairline bg-bg shadow-md p-3 w-[280px] max-w-[calc(100vw-2rem)]";

const SR_ONLY =
  "absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)]";
// `flex-1 min-w-0` keeps the two native date inputs sharing the popover's
// fixed width instead of reporting their large intrinsic `max-content` width,
// which would otherwise balloon the `w-max` panel to the full content area
// (#476).
const DATE_INPUT_SM =
  "h-7 px-2 rounded-md border border-hairline bg-surface text-sm text-ink flex-1 min-w-0";

function DatePopover({
  fromId,
  toId,
  from,
  to,
  chipLabel,
  selectedPreset,
  open,
  onOpenChange,
  onSelectPreset,
  onChangeDate,
  onClear,
}: DatePopoverProps) {
  const applied = chipLabel !== null;
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      haspopup="dialog"
      label="期間フィルタ"
      panelClassName={FILTER_POPOVER_PANEL}
      clampToViewport
      trigger={(triggerProps) =>
        applied ? (
          <span data-active className={filterChip}>
            <button
              {...triggerProps}
              type="button"
              className="inline-flex items-center gap-1.5 outline-none"
            >
              期間: {chipLabel}
              <span className={filterChipCaret} aria-hidden="true">
                ▾
              </span>
            </button>
            <button
              type="button"
              aria-label="期間フィルタを解除"
              onClick={onClear}
              className={filterChipRemove}
            >
              ×
            </button>
          </span>
        ) : (
          <button {...triggerProps} type="button" className={filterChipGhost}>
            期間
            <span className={filterChipCaret} aria-hidden="true">
              ▾
            </span>
          </button>
        )
      }
    >
      {({ close }) => (
        <div className="flex flex-col gap-3 w-full">
          {/* biome-ignore lint/a11y/useSemanticElements: role="group" labels the preset toggle buttons; <fieldset> carries form-control semantics that are inappropriate here (mirrors DirectoryTree). */}
          <div role="group" aria-label="プリセット">
            <div className={`${filterLabel} mb-2`}>プリセット</div>
            <div className="grid grid-cols-3 gap-1.5">
              {DATE_RANGE_PRESETS.map((preset) => {
                const sel = selectedPreset === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    data-active={sel || undefined}
                    aria-pressed={sel}
                    onClick={() => onSelectPreset(preset)}
                    className="text-xs rounded-pill border border-hairline bg-bg px-1 py-1.5 text-ink transition-colors motion-reduce:transition-none hover:bg-surface data-[active]:bg-ink data-[active]:text-white data-[active]:border-ink"
                  >
                    {dateRangePresetLabels[preset]}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className={`${filterLabel} mb-2`}>範囲指定</div>
            <div className="flex items-center gap-2">
              <label htmlFor={fromId} className={SR_ONLY}>
                開始日
              </label>
              <input
                id={fromId}
                type="date"
                value={from ?? ""}
                onChange={(e) => onChangeDate("from", e.target.value)}
                className={DATE_INPUT_SM}
              />
              <span aria-hidden="true">–</span>
              <label htmlFor={toId} className={SR_ONLY}>
                終了日
              </label>
              <input
                id={toId}
                type="date"
                value={to ?? ""}
                onChange={(e) => onChangeDate("to", e.target.value)}
                className={DATE_INPUT_SM}
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={onClear}
              className="text-xs text-ink-secondary underline hover:text-ink"
            >
              クリア
            </button>
            <button
              type="button"
              onClick={close}
              className="text-xs text-ink-secondary hover:text-ink"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}

type VisibilityPopoverProps = Readonly<{
  value: Visibility;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSelect: (value: VisibilityOption) => void;
  onClear: () => void;
}>;

// menuitemradio highlight: `focus-visible:` (not `focus:`) so the roving
// programmatic focus on open does not grey the landed item; `data-[active]`
// keeps the selected-option surface + weight. The shared `menuItem` style is
// intentionally NOT reused here because it lacks the `data-[active]` selection
// indicator this radio group needs (#467 plan ステップ9).
const VISIBILITY_OPTION_ITEM =
  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink outline-none hover:bg-surface focus-visible:bg-surface data-[active]:bg-surface data-[active]:font-medium";

function VisibilityPopover({
  value,
  open,
  onOpenChange,
  onSelect,
  onClear,
}: VisibilityPopoverProps) {
  const menuRef = useRef<HTMLElement | null>(null);
  const applied = value !== undefined;

  // Land roving focus on the currently-selected option when the menu opens.
  const initialIndex = (() => {
    const i = VISIBILITY_OPTIONS.findIndex((o) =>
      o === "all" ? value === undefined : o === value,
    );
    return i < 0 ? 0 : i;
  })();

  const roving = useRovingMenu({
    open,
    itemCount: VISIBILITY_OPTIONS.length,
    panelRef: menuRef,
    itemRole: "menuitemradio",
    initialIndex,
  });

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      haspopup="menu"
      label="公開状態フィルタ"
      panelClassName={FILTER_POPOVER_PANEL}
      clampToViewport
      panelRef={(node) => {
        menuRef.current = node;
      }}
      onMenuKeyDown={roving.onKeyDown}
      trigger={(triggerProps) =>
        applied ? (
          <span data-active className={filterChip}>
            <button
              {...triggerProps}
              type="button"
              className="inline-flex items-center gap-1.5 outline-none"
            >
              公開状態: {visibilityLabel(value)}
              <span className={filterChipCaret} aria-hidden="true">
                ▾
              </span>
            </button>
            <button
              type="button"
              aria-label="公開状態フィルタを解除"
              onClick={onClear}
              className={filterChipRemove}
            >
              ×
            </button>
          </span>
        ) : (
          <button {...triggerProps} type="button" className={filterChipGhost}>
            公開状態
            <span className={filterChipCaret} aria-hidden="true">
              ▾
            </span>
          </button>
        )
      }
    >
      {VISIBILITY_OPTIONS.map((option, index) => {
        const checked =
          option === "all" ? value === undefined : option === value;
        return (
          // Rendered as a direct child of the `role="menu"` panel — no
          // wrapper element — so the menu→menuitemradio ownership the WAI-ARIA
          // Menu pattern requires is not broken by an intervening generic node.
          <button
            key={option}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            tabIndex={roving.getTabIndex(index)}
            data-active={checked || undefined}
            onClick={() => onSelect(option)}
            className={VISIBILITY_OPTION_ITEM}
          >
            <span
              aria-hidden="true"
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${visibilitySwatchClass(option)}`}
            />
            {visibilityLabel(option)}
            {checked ? (
              <span aria-hidden="true" className="ml-auto text-success">
                ✓
              </span>
            ) : null}
          </button>
        );
      })}
    </Popover>
  );
}
