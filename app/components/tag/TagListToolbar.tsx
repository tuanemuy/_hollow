"use client";

import { useRouter } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useTransition } from "react";
import { Icon } from "@/components/common/Icon";
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

export function TagListToolbar({ query, sort, order }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // `validateSearch` re-defaults `sort`/`order` at the route loader, so we
  // only ever write the parts that change and let the URL stay minimal.
  const navigate = (next: Partial<TagListSearch>): void => {
    startTransition(async () => {
      try {
        await router.navigate({
          to: "/tags",
          search: (prev) => {
            const p = prev as Partial<TagListSearch>;
            return { ...p, ...next };
          },
        });
      } catch {
        // Navigation cancelled/superseded — `isPending` settles either way.
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

  const nextOrder: TagListOrder = order === "asc" ? "desc" : "asc";

  return (
    <div className={TAG_TOOLBAR}>
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
            disabled={isPending}
            className={TAG_SEARCH_INPUT}
          />
        </form>
      </search>

      <div className={TAG_SORT}>
        <span className={TAG_SORT_LABEL}>並び替え</span>
        <div className={SEGMENTED} role="tablist" aria-label="並び替え軸">
          {TAG_LIST_SORTS.map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={s === sort}
              data-active={s === sort || undefined}
              disabled={isPending}
              className={SEGMENTED_ITEM}
              onClick={() => navigate({ sort: s })}
            >
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="昇順 / 降順を切り替え"
          aria-pressed={order === "desc"}
          title={order === "asc" ? "昇順" : "降順"}
          disabled={isPending}
          className={TAG_SORT_DIR}
          onClick={() => navigate({ order: nextOrder })}
        >
          <Icon icon={order === "asc" ? ArrowUp : ArrowDown} />
        </button>
      </div>
    </div>
  );
}
