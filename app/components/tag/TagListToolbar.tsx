"use client";

import { useRouter } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { Icon } from "@/components/common/Icon";
import { useRovingTablist } from "@/components/common/useRovingTablist";
import type { TagListSearch } from "./schema";
import { TAG_LIST_SORTS } from "./schema";
import {
  SEGMENTED,
  SEGMENTED_ITEM,
  TAG_SEARCH,
  TAG_SEARCH_ICON,
  TAG_SEARCH_INPUT,
  TAG_SORT,
  TAG_SORT_DIR,
  TAG_SORT_LABEL,
  TAG_TOOLBAR,
} from "./styles";
import type { TagListOrder, TagListSort } from "./TagList";

type Props = {
  query: string | undefined;
  sort: TagListSort;
  order: TagListOrder;
};

const SORT_LABELS: Record<TagListSort, string> = {
  name: "名前",
  noteCount: "ノート数",
  createdAt: "作成日時",
  lastUsedAt: "最終使用",
};

type SortState = Readonly<{ sort: TagListSort; order: TagListOrder }>;

type SortAction =
  | Readonly<{ type: "setSort"; sort: TagListSort }>
  | Readonly<{ type: "setOrder"; order: TagListOrder }>;

function reduceSort(cur: SortState, action: SortAction): SortState {
  switch (action.type) {
    case "setSort":
      return { ...cur, sort: action.sort };
    case "setOrder":
      return { ...cur, order: action.order };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function TagListToolbar({ query, sort, order }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Server-confirmed baseline. `useOptimistic` mirrors the sort axis / order
  // selection synchronously while the loader round-trip is in flight, then
  // snaps back once fresh props arrive — matching `note/list/FilterBar.tsx`
  // (ADR-004). Search (`q`) is intentionally NOT optimistic: it stays an
  // uncontrolled input keyed on the applied `query` to protect IME input and
  // because there is no applied-query chip to reflect (P-002).
  const baseline: SortState = { sort, order };
  const [optimistic, applyOptimistic] = useOptimistic(baseline, reduceSort);

  // `validateSearch` re-defaults `sort`/`order` at the route loader, so we
  // only ever write the parts that change and let the URL stay minimal. The
  // patch + navigation run in one transition so the selection renders
  // immediately and the loader fetch shows as pending; controls stay enabled
  // throughout so rapid toggles are not dropped (FilterBar `run` pattern).
  const run = (action: SortAction, next: Partial<TagListSearch>): void => {
    startTransition(async () => {
      applyOptimistic(action);
      try {
        await router.navigate({
          to: "/tags",
          search: (prev) => {
            const p = prev as Partial<TagListSearch>;
            return { ...p, ...next };
          },
        });
      } catch {
        // Reverting to baseline is the correct fallback for a sort toggle.
      }
    });
  };

  const onSubmitSearch = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const value = new FormData(e.currentTarget).get("q");
    const q = typeof value === "string" ? value.trim() : "";
    startTransition(async () => {
      try {
        await router.navigate({
          to: "/tags",
          // Empty search drops `q` from the URL entirely.
          search: (prev) => {
            const { q: _drop, ...rest } = prev as Partial<TagListSearch>;
            return q === "" ? rest : { ...rest, q };
          },
        });
      } catch {
        // Navigation cancelled/superseded.
      }
    });
  };

  const nextOrder: TagListOrder = optimistic.order === "asc" ? "desc" : "asc";

  // APG Radio Group roving tabindex for the sort axis (Issue #776 ADR-001):
  // automatic activation, so arrow/Home/End move focus AND select, converging
  // on the same `run({ type: "setSort" })` the click path uses.
  const sortRoving = useRovingTablist({
    count: TAG_LIST_SORTS.length,
    selectedIndex: TAG_LIST_SORTS.indexOf(optimistic.sort),
    onSelect: (index) =>
      run(
        { type: "setSort", sort: TAG_LIST_SORTS[index] },
        { sort: TAG_LIST_SORTS[index] },
      ),
    // `sort` is in `loaderDeps`, so an arrow selection drives a data-driven RSC
    // re-render that drops focus to `<body>`; restore it to the selected radio
    // so consecutive arrow presses keep working (#781).
    restoreFocusOnCommit: true,
  });

  return (
    <div className={TAG_TOOLBAR} aria-busy={isPending}>
      <search className={TAG_SEARCH}>
        <form className="relative" onSubmit={onSubmitSearch}>
          <Icon icon={Search} className={TAG_SEARCH_ICON} />
          <input
            type="search"
            name="q"
            // `defaultValue` (uncontrolled) keeps the box independent of the
            // optimistic rename/delete state in `TagList`; the URL is the SSOT.
            defaultValue={query ?? ""}
            // Re-key on the applied query so a back/forward navigation resets
            // the uncontrolled input to the URL value.
            key={query ?? ""}
            placeholder="タグを検索"
            aria-label="タグを検索"
            className={TAG_SEARCH_INPUT}
          />
        </form>
      </search>

      <div className={TAG_SORT}>
        <span className={TAG_SORT_LABEL}>並び替え</span>
        <div
          ref={sortRoving.containerRef}
          className={SEGMENTED}
          role="radiogroup"
          aria-label="並び替え軸"
          aria-orientation="horizontal"
          onKeyDown={sortRoving.onKeyDown}
        >
          {TAG_LIST_SORTS.map((s, index) => (
            // biome-ignore lint/a11y/useSemanticElements: <input type="radio"> cannot reproduce the text segmented control's data-active styling and Space/Enter activation; button + role="radio" expresses the APG Radio Group (#776 ADR-001).
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={s === optimistic.sort}
              data-active={s === optimistic.sort || undefined}
              tabIndex={sortRoving.getTabIndex(index)}
              className={SEGMENTED_ITEM}
              onClick={() => run({ type: "setSort", sort: s }, { sort: s })}
            >
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="昇順 / 降順を切り替え"
          aria-pressed={optimistic.order === "desc"}
          title={optimistic.order === "asc" ? "昇順" : "降順"}
          className={TAG_SORT_DIR}
          onClick={() =>
            run({ type: "setOrder", order: nextOrder }, { order: nextOrder })
          }
        >
          <Icon icon={optimistic.order === "asc" ? ArrowUp : ArrowDown} />
        </button>
      </div>
    </div>
  );
}
