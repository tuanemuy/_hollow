"use client";

import { useRouter } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useTransition } from "react";
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
 * P32 sort toggle: cycles 関連度順 ⇄ 新着順 on click (two options, so a
 * cycle button instead of a dropdown — .issue/642/adr.md ADR-002). The URL
 * is the single source of truth: `sort=newest` is written explicitly,
 * relevance removes the param to keep the URL clean, and any switch drops
 * `cursor` so the offset cursor never applies to a re-ordered list.
 */
export function SearchSortToggle({ sort }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const current: SearchSort = sort ?? "relevance";
  const next: SearchSort = current === "relevance" ? "newest" : "relevance";

  const toggle = () => {
    startTransition(async () => {
      try {
        // Same structural cast rationale as `SearchFilterDrawer.navigate`:
        // the strict search schema rejects the open `Record` reducer shape
        // under `exactOptionalPropertyTypes`; `validateSearch` re-validates
        // the params on commit.
        await router.navigate({
          to: "/search",
          search: (prev) => {
            const nextSearch: Record<string, unknown> = {
              ...(prev as Record<string, unknown>),
            };
            // A sort change resets pagination.
            nextSearch.cursor = undefined;
            nextSearch.sort = next === "relevance" ? undefined : next;
            return nextSearch as never;
          },
        });
      } catch {
        // A cancelled / rejected navigation keeps the current sort.
      }
    });
  };

  return (
    <button
      type="button"
      className={SEARCH_SORT_BTN}
      aria-label={`並び替え: ${SORT_LABELS[current]}（${SORT_LABELS[next]}に切り替え）`}
      onClick={toggle}
    >
      {SORT_LABELS[current]}
      <ChevronDown className="size-[11px]" strokeWidth={2} aria-hidden="true" />
    </button>
  );
}
