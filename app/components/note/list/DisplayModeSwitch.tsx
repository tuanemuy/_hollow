"use client";

import { useRouter } from "@tanstack/react-router";
import { useTransition } from "react";
import { HOME_SEARCH } from "@/components/auth/links";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import { DISPLAY_MODES, type DisplayMode } from "../constants";
import type { NoteListSearch } from "../schema";

type Props = {
  current: DisplayMode;
};

const LABELS: Record<DisplayMode, string> = {
  list: "リスト",
  tile: "タイル",
  calendar: "カレンダー",
};

export function DisplayModeSwitch({ current }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const select = (mode: DisplayMode) => {
    if (mode === current) return;
    startTransition(() => {
      router.navigate({
        to: "/",
        // `prev` is the inferred cross-route search union, so `page`/`limit`
        // may be `undefined`. Collapse onto `HOME_SEARCH` so the returned
        // shape always satisfies the home schema's required defaults.
        search: (prev) => ({
          ...(prev as Partial<NoteListSearch>),
          page: (prev as Partial<NoteListSearch>).page ?? HOME_SEARCH.page,
          limit: (prev as Partial<NoteListSearch>).limit ?? HOME_SEARCH.limit,
          display: mode,
        }),
      });
    });
  };

  return (
    <div
      role="tablist"
      aria-label="表示形式"
      className="inline-flex gap-1"
      aria-busy={isPending}
    >
      {DISPLAY_MODES.map((mode) => {
        const active = mode === current;
        return (
          <button
            key={mode}
            role="tab"
            type="button"
            aria-selected={active}
            data-primary={active || undefined}
            className={`${pillBtn} ${pillBtnPrimary}`}
            onClick={() => select(mode)}
            disabled={isPending}
          >
            {LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}
