"use client";

import { useRouter } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { useId, useOptimistic, useRef, useState, useTransition } from "react";
import { Popover } from "@/components/common/Popover";
import { popoverSheetPanel, TOUCH_TARGET } from "@/components/common/styles";
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
  filterBar,
  filterChip,
  filterChipCaret,
  filterChipGhost,
  filterChipRemove,
  filterClearX,
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
  // Mutually-exclusive popover state: opening one closes the others.
  const [openPopover, setOpenPopover] = useState<
    "tag" | "date" | "visibility" | null
  >(null);
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

  // The toggle is computed inside the updater from `prev.tagNames` (the
  // search at navigate time), not from a render-time snapshot — a snapshot
  // captured before earlier navigations commit would make rapid toggles
  // overwrite each other (Issue #664).
  const toggleTag = (name: string) => {
    run({ type: "toggleTag", name }, (prev) => {
      const next = new Set(prev.tagNames ?? []);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      const arr = [...next];
      return homeSearchUpdater(prev, {
        tagNames: arr.length === 0 ? undefined : arr,
      });
    });
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
    <div className={filterBar} aria-busy={isPending}>
      {tags.length > 0 ? (
        <div className="inline-flex gap-1.5 flex-wrap max-sm:flex-nowrap max-sm:shrink-0">
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

      {tags.length > 0 ? (
        <TagPickerPopover
          tags={tags}
          selected={selected}
          open={openPopover === "tag"}
          onOpenChange={(next) => setOpenPopover(next ? "tag" : null)}
          onToggle={toggleTag}
        />
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
          className={filterClearX}
          aria-label="フィルタをすべてクリア"
          title="フィルタをすべてクリア"
          onClick={clearAll}
        >
          <X
            className="size-[var(--icon-xs)]"
            strokeWidth={1.8}
            aria-hidden="true"
          />
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

type TagPickerPopoverProps = Readonly<{
  tags: readonly TagOption[];
  selected: ReadonlySet<string>;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onToggle: (name: string) => void;
}>;

// Extension of VISIBILITY_OPTION_ITEM / ViewSwitcher's OPTION_ITEM: adds an
// accent focus-visible outline ring, `[overflow-wrap:anywhere]` for long tag
// names, and TOUCH_TARGET. VISIBILITY_OPTION_ITEM carries the same additions
// so the two adjacent filter popovers focus-render identically; full
// consolidation into a shared constant is a follow-up.
const TAG_OPTION_ITEM = `flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink outline-none hover:bg-surface focus-visible:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 data-[active]:bg-surface data-[active]:font-medium [overflow-wrap:anywhere] ${TOUCH_TARGET}`;

/**
 * "+ タグ" ghost-chip trigger + multi-select tag listbox. The panel stays
 * open across toggles (`aria-multiselectable`); each option click runs the
 * same optimistic `toggleTag` as the inline tag chips. `title` is rendered
 * unconditionally — intentional deviation from the mobile mock, matching the
 * clear-× precedent.
 */
function TagPickerPopover({
  tags,
  selected,
  open,
  onOpenChange,
  onToggle,
}: TagPickerPopoverProps) {
  const listRef = useRef<HTMLElement | null>(null);

  // APG Listbox pattern: land roving focus on the first selected option when
  // the picker opens (fall back to the first option), matching
  // VisibilityPopover's landing behaviour within the same FilterBar.
  const initialIndex = (() => {
    const i = tags.findIndex((t) => selected.has(t.name));
    return i < 0 ? 0 : i;
  })();

  const roving = useRovingMenu({
    open,
    itemCount: tags.length,
    panelRef: listRef,
    itemRole: "option",
    initialIndex,
    // The multi-select panel stays open across toggles, so the RSC re-render
    // after each filter navigation can drop focus to <body> — only this
    // consumer needs the after-commit restore pass.
    restoreFocusOnCommit: true,
  });

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      haspopup="listbox"
      multiselectable
      label="タグで絞り込み"
      panelClassName={`${FILTER_POPOVER_PANEL} max-h-[min(60vh,400px)] overflow-y-auto`}
      clampToViewport
      panelRef={(node) => {
        listRef.current = node;
      }}
      onMenuKeyDown={roving.onKeyDown}
      trigger={(triggerProps) => (
        <button
          {...triggerProps}
          type="button"
          aria-label="タグで絞り込み"
          title="タグで絞り込み"
          className={filterChipGhost}
        >
          <Plus
            className="size-[11px] shrink-0"
            strokeWidth={2}
            aria-hidden="true"
          />
          タグ
        </button>
      )}
    >
      {tags.map((tag, index) => {
        const active = selected.has(tag.name);
        return (
          <button
            key={tag.id}
            type="button"
            role="option"
            aria-selected={active}
            data-active={active || undefined}
            tabIndex={roving.getTabIndex(index)}
            onClick={() => {
              // The listbox panel's mousedown preventDefault keeps focus
              // put, so sync the roving index here — otherwise the next
              // ArrowDown after a click would move from the stale index.
              roving.setActiveIndex(index);
              onToggle(tag.name);
            }}
            className={TAG_OPTION_ITEM}
          >
            #{tag.name}
            <span className="text-[11px] text-ink-tertiary">
              {tag.noteCount}
            </span>
            {active ? (
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

// Built on the shared `popoverSheetPanel` (#588 ADR-003): below `sm` it
// becomes a full-width bottom-anchored sheet (`max-sm:left-0 max-sm:right-0
// max-sm:w-auto`, supplied by the shared constant), so the panel never overflows
// the narrow viewport and the `clampToViewport` shiftX is unnecessary.
//
// At `sm` and up it is a floating card: `left-0` anchors the panel to the
// trigger's left edge and `<Popover>`'s `clampToViewport` nudges it into the
// viewport (#476). The fixed `sm:w-[280px]` (rather than `w-max`) keeps the
// native `<input type="date">` children from ballooning the panel to their
// huge intrinsic `max-content` width; `sm:max-w` still caps it.
//
// `sm:p-3` overrides the shared `popoverSheetPanel`'s `p-4` (16px, mock-aligned
// for the mobile sheet) back to the 12px desktop padding the mock specifies.
const FILTER_POPOVER_PANEL = `absolute left-0 top-full mt-2 z-40 ${popoverSheetPanel} sm:p-3 sm:w-[280px] sm:max-w-[calc(100vw-2rem)]`;

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
// indicator this radio group needs. Carries the same focus ring /
// overflow-wrap / TOUCH_TARGET additions as TAG_OPTION_ITEM so keyboard focus
// renders identically across the adjacent filter popovers; consolidation into
// a shared constant is a follow-up.
const VISIBILITY_OPTION_ITEM = `flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink outline-none hover:bg-surface focus-visible:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 data-[active]:bg-surface data-[active]:font-medium [overflow-wrap:anywhere] ${TOUCH_TARGET}`;

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
