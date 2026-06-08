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
import {
  CHIP,
  CHIP_REMOVE,
  FILTER_ROW,
  SEGMENTED,
  SEGMENTED_BTN,
  SORT_BTN,
  TOOLBAR,
} from "./styles";

export type DisplayMode = "list" | "tile" | "calendar";
export type SortAxis = "updatedAt" | "createdAt" | "title";

export const SORT_ORDER: readonly SortAxis[] = [
  "updatedAt",
  "createdAt",
  "title",
];

/**
 * Build the next URL-search params for a tag / sort change. Pure so the
 * wiring is unit-tested without a router. `tags` / `sort` are loader-dep
 * params, so any change resets to the first page; the default values
 * (`updatedAt`, empty tags) are dropped to keep the URL clean.
 */
export function nextFilterSearch(
  prev: Record<string, unknown>,
  patch: { tags?: readonly string[]; sort?: SortAxis },
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...prev };
  next.page = undefined;
  if ("tags" in patch) {
    next.tags = patch.tags && patch.tags.length > 0 ? patch.tags : undefined;
  }
  if ("sort" in patch) {
    next.sort = patch.sort === "updatedAt" ? undefined : patch.sort;
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

/** Cycle to the next sort axis (wraps). */
export function nextSortAxis(current: SortAxis): SortAxis {
  const idx = SORT_ORDER.indexOf(current);
  return SORT_ORDER[(idx + 1) % SORT_ORDER.length];
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

// "公開日順" is backed by `updatedAt` (see listUserPublicNotes /
// progress.md). The toggle flips between updated-desc and title-asc so the
// sort button is functional rather than decorative.
const SORT_LABELS: Readonly<Record<SortAxis, string>> = {
  updatedAt: "公開日順",
  createdAt: "作成日順",
  title: "タイトル順",
};

const selectDisplay = (s: { display?: DisplayMode | undefined }): DisplayMode =>
  s.display ?? "list";
const selectTags = (s: {
  tags?: readonly string[] | undefined;
}): readonly string[] => s.tags ?? [];
const selectSort = (s: { sort?: SortAxis | undefined }): SortAxis =>
  s.sort ?? "updatedAt";

/**
 * Client island for the P30 filter chips, display segmented control and
 * sort toggle (#568). Tags / sort drive the URL (server re-fetch via
 * `loaderDeps`); `display` is a client-only swap excluded from
 * `loaderDeps` (ADR-004). Bound to `getRouteApi("/u/$username/")` —
 * cannot reuse the auth-side `DisplayModeSwitch` (`/_app/` bound).
 *
 * `tagOptions` are the chip candidates the server discovered in the
 * current listing; selected tags are merged in so a chip with its remove
 * (×) affordance stays visible even when the active filter narrows the
 * page away from it.
 */
export function PublicTopControls({
  tagOptions,
}: Readonly<{ tagOptions: readonly string[] }>) {
  const router = useRouter();
  const username = route.useParams().username;
  const display = route.useSearch({ select: selectDisplay });
  const activeTags = route.useSearch({ select: selectTags });
  const sort = route.useSearch({ select: selectSort });

  const chips = mergeTagChips(tagOptions, activeTags);

  const navigate = (patch: { tags?: readonly string[]; sort?: SortAxis }) => {
    router.navigate({
      to: "/u/$username",
      params: { username },
      search: (prev: Record<string, unknown>) => nextFilterSearch(prev, patch),
    });
  };

  const toggleTag = (tag: string) => {
    navigate({ tags: toggleTagSet(activeTags, tag) });
  };

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

  const cycleSort = () => {
    navigate({ sort: nextSortAxis(sort) });
  };

  return (
    <>
      <div className={FILTER_ROW}>
        <button
          type="button"
          className={CHIP}
          data-active={activeTags.length === 0 || undefined}
          onClick={() => navigate({ tags: [] })}
        >
          すべて
        </button>
        {chips.map((tag) => {
          const active = activeTags.includes(tag);
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
      </div>

      <div className={TOOLBAR}>
        <div className={SEGMENTED} role="tablist" aria-label="表示形式">
          {DISPLAY_OPTIONS.map(({ mode, label, icon }) => {
            const active = mode === display;
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
                {(() => {
                  const IconComponent = icon;
                  return (
                    <IconComponent
                      className="size-[var(--icon-xs)]"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  );
                })()}
                {label}
              </button>
            );
          })}
        </div>

        <button type="button" className={SORT_BTN} onClick={cycleSort}>
          {SORT_LABELS[sort]}
          <ChevronDown
            className="size-[var(--icon-2xs)]"
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>
      </div>
    </>
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
