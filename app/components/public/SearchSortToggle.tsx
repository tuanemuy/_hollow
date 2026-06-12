"use client";

import { useRouter } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import type { SearchSort } from "@/core/domain/search/valueObject";
import { SEARCH_SORT_BTN } from "./styles";

const SORT_LABELS: Record<SearchSort, string> = {
  relevance: "関連度順",
  newest: "新着順",
};

type Props = Readonly<{
  // Confirmed sort from the URL (`null` = relevance, the default).
  sort: SearchSort | null;
}>;

/**
 * Pure navigate reducer for a sort change: any switch drops `cursor` so the
 * offset cursor never applies to a re-ordered list, and `relevance` (the
 * default) removes `sort` to keep the URL clean. All other params pass
 * through untouched.
 */
export function reduceSortSearch(
  prev: Record<string, unknown>,
  sort: SearchSort,
): Record<string, unknown> {
  return {
    ...prev,
    cursor: undefined,
    sort: sort === "relevance" ? undefined : sort,
  };
}

/**
 * P32 sort toggle: cycles 関連度順 ⇄ 新着順 on click (two options, so a
 * cycle button instead of a dropdown). The URL is the single source of
 * truth; the label is mirrored optimistically while the loader round-trip
 * is in flight (FilterBar precedent) and snaps back to the URL-confirmed
 * value once the navigation commits. Deriving `next` from the optimistic value also
 * keeps rapid double-clicks toggling as expected instead of re-sending the
 * same sort.
 */
export function SearchSortToggle({ sort }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const confirmed: SearchSort = sort ?? "relevance";
  const [current, applyOptimistic] = useOptimistic(
    confirmed,
    (_prev: SearchSort, next: SearchSort) => next,
  );
  const next: SearchSort = current === "relevance" ? "newest" : "relevance";

  const toggle = () => {
    startTransition(async () => {
      applyOptimistic(next);
      try {
        // Same structural cast rationale as `SearchFilterDrawer.navigate`:
        // the strict search schema rejects the open `Record` reducer shape
        // under `exactOptionalPropertyTypes`; `validateSearch` re-validates
        // the params on commit.
        await router.navigate({
          to: "/search",
          search: (prev) =>
            reduceSortSearch(prev as Record<string, unknown>, next) as never,
        });
      } catch {
        // A cancelled / rejected navigation reverts the optimistic sort.
      }
    });
  };

  return (
    <button
      type="button"
      className={SEARCH_SORT_BTN}
      aria-label={`並び替え: ${SORT_LABELS[current]}（${SORT_LABELS[next]}に切り替え）`}
      aria-busy={isPending || undefined}
      data-pending={isPending || undefined}
      onClick={toggle}
    >
      {SORT_LABELS[current]}
      <ChevronDown className="size-[11px]" strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
