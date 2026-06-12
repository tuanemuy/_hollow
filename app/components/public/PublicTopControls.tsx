"use client";

import { getRouteApi, useRouter } from "@tanstack/react-router";
import {
  Calendar,
  ChevronDown,
  LayoutGrid,
  List,
  type LucideIcon,
  X,
} from "lucide-react";
import { useId, useOptimistic, useRef, useState, useTransition } from "react";
import { Popover } from "@/components/common/Popover";
import { useRovingMenu } from "@/components/common/useRovingMenu";
import {
  DATE_RANGE_PRESETS,
  type DateRangePreset,
  dateRangePresetLabels,
  formatDateRangeChipLabel,
  matchDateRangePreset,
  resolveDateRangePreset,
} from "../note/list/listSelectors";
import {
  CHIP,
  CHIP_REMOVE,
  FILTER_ROW,
  SEGMENTED,
  SEGMENTED_BTN,
  SORT_BTN,
  SORT_MENU_ITEM,
  SORT_MENU_PANEL,
  TOOLBAR,
} from "./styles";

export type DisplayMode = "list" | "tile" | "calendar";
export type SortAxis = "publishedAt" | "updatedAt" | "createdAt" | "title";

export const SORT_ORDER: readonly SortAxis[] = [
  "publishedAt",
  "updatedAt",
  "createdAt",
  "title",
];

/**
 * Build the next URL-search params for a tag / sort / period change. Pure so
 * the wiring is unit-tested without a router. `tags` / `sort` / `from` / `to`
 * are loader-dep params, so any change resets to the first page; the default
 * values (`publishedAt`, empty tags, no period) are dropped to keep the URL
 * clean.
 */
export function nextFilterSearch(
  prev: Record<string, unknown>,
  patch: {
    tags?: readonly string[];
    sort?: SortAxis;
    from?: string | undefined;
    to?: string | undefined;
  },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...prev };
  next.page = undefined;
  if ("tags" in patch) {
    next.tags = patch.tags && patch.tags.length > 0 ? patch.tags : undefined;
  }
  if ("sort" in patch) {
    next.sort = patch.sort === "publishedAt" ? undefined : patch.sort;
  }
  if ("from" in patch) {
    next.from = patch.from;
  }
  if ("to" in patch) {
    next.to = patch.to;
  }
  return next;
}

/** Toggle `tag` in/out of the active set (membership-based). */
export function toggleTagSet(
  active: readonly string[],
  tag: string,
): readonly string[] {
  return active.includes(tag)
    ? active.filter((t) => t !== tag)
    : [...active, tag];
}

const route = getRouteApi("/u/$username/");

const DISPLAY_OPTIONS: ReadonlyArray<{
  mode: DisplayMode;
  label: string;
  icon: LucideIcon;
}> = [
  { mode: "list", label: "リスト", icon: List },
  { mode: "tile", label: "タイル", icon: LayoutGrid },
  { mode: "calendar", label: "カレンダー", icon: Calendar },
];

// "公開日順" is backed by the publication aggregate's `published_at`; the
// other axes sort on note columns. Presentation chooses the axis via dropdown.
const SORT_LABELS: Readonly<Record<SortAxis, string>> = {
  publishedAt: "公開日順",
  updatedAt: "更新日順",
  createdAt: "作成日順",
  title: "タイトル順",
};

const selectDisplay = (s: { display?: DisplayMode | undefined }): DisplayMode =>
  s.display ?? "list";
const selectTags = (s: {
  tags?: readonly string[] | undefined;
}): readonly string[] => s.tags ?? [];
const selectSort = (s: { sort?: SortAxis | undefined }): SortAxis =>
  s.sort ?? "publishedAt";
const selectFrom = (s: { from?: string | undefined }): string | undefined =>
  s.from;
const selectTo = (s: { to?: string | undefined }): string | undefined => s.to;

type OptimisticFilters = Readonly<{
  tagNames: ReadonlySet<string>;
  sort: SortAxis;
  from: string | undefined;
  to: string | undefined;
}>;

type FilterAction =
  | Readonly<{ type: "setTags"; tags: readonly string[] }>
  | Readonly<{ type: "setSort"; sort: SortAxis }>
  | Readonly<{
      type: "setDateRange";
      from: string | undefined;
      to: string | undefined;
    }>
  | Readonly<{
      type: "setDate";
      key: "from" | "to";
      value: string | undefined;
    }>;

function reduceFilters(
  cur: OptimisticFilters,
  action: FilterAction,
): OptimisticFilters {
  switch (action.type) {
    case "setTags":
      return { ...cur, tagNames: new Set(action.tags) };
    case "setSort":
      return { ...cur, sort: action.sort };
    case "setDateRange":
      return { ...cur, from: action.from, to: action.to };
    case "setDate":
      return { ...cur, [action.key]: action.value };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/**
 * Client island for the P30 filter chips, period filter, display segmented
 * control and sort dropdown.
 *
 * Tags / sort / period drive the URL (server re-fetch via `loaderDeps`) and are
 * mirrored into an optimistic state so changes reflect immediately while the
 * loader round-trip is in flight. `display` is client-only, excluded from
 * `loaderDeps` and NOT held in optimistic state (to avoid double-sourcing with
 * `PublicNoteViews`' own `useSearch` read).
 *
 * `tagOptions` are the chip candidates the server discovered in the current
 * listing; selected tags are merged in so a chip with its remove (×) affordance
 * stays visible even when the active filter narrows the page away from it.
 */
export function PublicTopControls({
  tagOptions,
}: Readonly<{ tagOptions: readonly string[] }>) {
  const router = useRouter();
  const username = route.useParams().username;
  const display = route.useSearch({ select: selectDisplay });
  const activeTags = route.useSearch({ select: selectTags });
  const sort = route.useSearch({ select: selectSort });
  const from = route.useSearch({ select: selectFrom });
  const to = route.useSearch({ select: selectTo });

  const [isPending, startTransition] = useTransition();
  const [openPopover, setOpenPopover] = useState<"sort" | "date" | null>(null);
  const fromId = useId();
  const toId = useId();

  const baseline: OptimisticFilters = {
    tagNames: new Set(activeTags),
    sort,
    from,
    to,
  };
  const [optimistic, applyOptimistic] = useOptimistic(baseline, reduceFilters);

  // Optimistic patch + URL navigation in a single transition: the patched
  // value renders immediately, the loader fetch shows as pending, and the
  // navigation is awaited inside the transition so `useOptimistic` does not
  // snap back to baseline before the fresh props commit. Cancelled navigations
  // revert cleanly to the server baseline.
  const run = (
    action: FilterAction,
    patch: {
      tags?: readonly string[];
      sort?: SortAxis;
      from?: string | undefined;
      to?: string | undefined;
    },
  ) => {
    startTransition(async () => {
      applyOptimistic(action);
      try {
        await router.navigate({
          to: "/u/$username",
          params: { username },
          search: (prev: Record<string, unknown>) =>
            nextFilterSearch(prev, patch),
        });
      } catch {
        // Fall back to server baseline on navigation error.
      }
    });
  };

  const optimisticTags = optimistic.tagNames;
  const optimisticSort = optimistic.sort;
  const optimisticFrom = optimistic.from;
  const optimisticTo = optimistic.to;

  const chips = mergeTagChips(tagOptions, [...optimisticTags]);

  const setTags = (tags: readonly string[]) => {
    run({ type: "setTags", tags }, { tags });
  };

  const toggleTag = (tag: string) => {
    setTags(toggleTagSet([...optimisticTags], tag));
  };

  const selectSortAxis = (axis: SortAxis) => {
    setOpenPopover(null);
    if (axis === optimisticSort) return;
    run({ type: "setSort", sort: axis }, { sort: axis });
  };

  const applyDateRange = (
    nextFrom: string | undefined,
    nextTo: string | undefined,
  ) => {
    run(
      { type: "setDateRange", from: nextFrom, to: nextTo },
      { from: nextFrom, to: nextTo },
    );
  };

  const updateDate = (key: "from" | "to", value: string) => {
    const v = value === "" ? undefined : value;
    run({ type: "setDate", key, value: v }, { [key]: v });
  };

  const selectPreset = (preset: DateRangePreset) => {
    const { from: f, to: t } = resolveDateRangePreset(preset, new Date());
    applyDateRange(f, t);
  };

  const clearDateRange = () => applyDateRange(undefined, undefined);

  // display mode is client-only (not in loaderDeps), so URL update reflects
  // synchronously without waiting for the loader round-trip.
  const selectDisplayMode = (mode: DisplayMode) => {
    if (mode === display) return;
    router.navigate({
      to: "/u/$username",
      params: { username },
      replace: true,
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        display: mode === "list" ? undefined : mode,
      }),
    });
  };

  return (
    // display: contents preserves `.user-tools` flex gap; wrapper carries aria-busy.
    <div className="contents" aria-busy={isPending}>
      <div className={FILTER_ROW}>
        <button
          type="button"
          className={CHIP}
          data-active={optimisticTags.size === 0 || undefined}
          onClick={() => setTags([])}
        >
          すべて
        </button>
        {chips.map((tag) => {
          const active = optimisticTags.has(tag);
          return (
            <button
              key={tag}
              type="button"
              className={`group ${CHIP}`}
              data-active={active || undefined}
              onClick={() => toggleTag(tag)}
            >
              #{tag}
              {active ? (
                <span className={CHIP_REMOVE} aria-hidden="true">
                  <X className="size-[var(--icon-2xs)]" strokeWidth={2.2} />
                </span>
              ) : null}
            </button>
          );
        })}

        <DatePopover
          fromId={fromId}
          toId={toId}
          from={optimisticFrom}
          to={optimisticTo}
          open={openPopover === "date"}
          onOpenChange={(next) => setOpenPopover(next ? "date" : null)}
          onSelectPreset={selectPreset}
          onChangeDate={updateDate}
          onClear={clearDateRange}
        />
      </div>

      <div className={TOOLBAR}>
        <div className={SEGMENTED} role="tablist" aria-label="表示形式">
          {DISPLAY_OPTIONS.map(({ mode, label, icon }) => {
            const active = mode === display;
            const IconComponent = icon;
            return (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={active}
                data-active={active || undefined}
                className={SEGMENTED_BTN}
                onClick={() => selectDisplayMode(mode)}
              >
                <IconComponent
                  className="size-[var(--icon-xs)]"
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
                {label}
              </button>
            );
          })}
        </div>

        <SortPopover
          value={optimisticSort}
          open={openPopover === "sort"}
          onOpenChange={(next) => setOpenPopover(next ? "sort" : null)}
          onSelect={selectSortAxis}
        />
      </div>
    </div>
  );
}

type DatePopoverProps = Readonly<{
  fromId: string;
  toId: string;
  from: string | undefined;
  to: string | undefined;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSelectPreset: (preset: DateRangePreset) => void;
  onChangeDate: (key: "from" | "to", value: string) => void;
  onClear: () => void;
}>;

const DATE_POPOVER_PANEL =
  "absolute left-0 top-full mt-2 z-40 rounded-lg border border-hairline bg-bg shadow-md p-3 w-[280px] max-w-[calc(100vw-2rem)] max-sm:fixed max-sm:left-0 max-sm:right-0 max-sm:w-auto max-sm:rounded-b-none max-sm:bottom-0 max-sm:top-auto max-sm:mt-0";
const SR_ONLY =
  "absolute w-px h-px p-0 -m-px overflow-hidden whitespace-nowrap border-0 [clip:rect(0,0,0,0)]";
const DATE_INPUT_SM =
  "h-7 px-2 rounded-md border border-hairline bg-surface text-sm text-ink flex-1 min-w-0";
const POPOVER_LABEL =
  "text-[11px] font-medium text-ink-tertiary uppercase tracking-wider";

// 期間 chip + popover reusing the `listSelectors` preset / range logic.
function DatePopover({
  fromId,
  toId,
  from,
  to,
  open,
  onOpenChange,
  onSelectPreset,
  onChangeDate,
  onClear,
}: DatePopoverProps) {
  const chipLabel = formatDateRangeChipLabel(from, to);
  const applied = chipLabel !== null;
  const selectedPreset = matchDateRangePreset(from, to, new Date());
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      haspopup="dialog"
      label="期間フィルタ"
      panelClassName={DATE_POPOVER_PANEL}
      clampToViewport
      trigger={(triggerProps) =>
        applied ? (
          <span data-active className={CHIP}>
            <button
              {...triggerProps}
              type="button"
              className="inline-flex items-center gap-1.5 outline-none"
            >
              <Calendar
                className="size-[var(--icon-2xs)]"
                strokeWidth={1.7}
                aria-hidden="true"
              />
              期間: {chipLabel}
              <ChevronDown
                className="size-[var(--icon-2xs)]"
                strokeWidth={2}
                aria-hidden="true"
              />
            </button>
            <button
              type="button"
              aria-label="期間フィルタを解除"
              onClick={onClear}
              className={CHIP_REMOVE}
            >
              <X className="size-[var(--icon-2xs)]" strokeWidth={2.2} />
            </button>
          </span>
        ) : (
          <button {...triggerProps} type="button" className={CHIP}>
            <Calendar
              className="size-[var(--icon-2xs)]"
              strokeWidth={1.7}
              aria-hidden="true"
            />
            期間
            <ChevronDown
              className="size-[var(--icon-2xs)]"
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        )
      }
    >
      {({ close }) => (
        <div className="flex flex-col gap-3 w-full">
          {/* biome-ignore lint/a11y/useSemanticElements: role="group" labels the preset toggle buttons; <fieldset> carries form-control semantics inappropriate here. */}
          <div role="group" aria-label="プリセット">
            <div className={`${POPOVER_LABEL} mb-2`}>プリセット</div>
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
            <div className={`${POPOVER_LABEL} mb-2`}>範囲指定</div>
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

type SortPopoverProps = Readonly<{
  value: SortAxis;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onSelect: (axis: SortAxis) => void;
}>;

// 4-axis sort selection menu: `Popover` with `useRovingMenu` for keyboard navigation.
function SortPopover({
  value,
  open,
  onOpenChange,
  onSelect,
}: SortPopoverProps) {
  const menuRef = useRef<HTMLElement | null>(null);
  const initialIndex = (() => {
    const i = SORT_ORDER.indexOf(value);
    return i < 0 ? 0 : i;
  })();
  const roving = useRovingMenu({
    open,
    itemCount: SORT_ORDER.length,
    panelRef: menuRef,
    itemRole: "menuitemradio",
    initialIndex,
  });

  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      haspopup="menu"
      label="並び順"
      panelClassName={SORT_MENU_PANEL}
      clampToViewport
      panelRef={(node) => {
        menuRef.current = node;
      }}
      onMenuKeyDown={roving.onKeyDown}
      trigger={(triggerProps) => (
        <button {...triggerProps} type="button" className={SORT_BTN}>
          {SORT_LABELS[value]}
          <ChevronDown
            className="size-[var(--icon-2xs)]"
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>
      )}
    >
      {SORT_ORDER.map((axis, index) => {
        const checked = axis === value;
        return (
          <button
            key={axis}
            type="button"
            role="menuitemradio"
            aria-checked={checked}
            tabIndex={roving.getTabIndex(index)}
            data-active={checked || undefined}
            onClick={() => onSelect(axis)}
            className={SORT_MENU_ITEM}
          >
            {SORT_LABELS[axis]}
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

/**
 * Merge the server-discovered chip candidates with the active tag set so a
 * selected tag whose chip would otherwise vanish (filtered page) keeps its
 * remove affordance. Order: active tags first (stable), then the remaining
 * discovered options.
 */
function mergeTagChips(
  options: readonly string[],
  active: readonly string[],
): readonly string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of active) {
    if (!seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  for (const tag of options) {
    if (!seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}
