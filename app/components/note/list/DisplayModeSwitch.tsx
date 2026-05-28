"use client";

import { getRouteApi, useRouter } from "@tanstack/react-router";
import { HOME_SEARCH } from "@/components/auth/links";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import { DISPLAY_MODES, type DisplayMode } from "../constants";
import type { NoteListSearch } from "../schema";
import { selectDisplay } from "./listSelectors";

const LABELS: Record<DisplayMode, string> = {
  list: "リスト",
  tile: "タイル",
  calendar: "カレンダー",
};

const homeRoute = getRouteApi("/");

/**
 * Client-only tab switcher for the list/tile/calendar display mode.
 * Home-route only (`getRouteApi("/")` binds the home schema).
 *
 * Issue #219: `display` is excluded from the home route's `loaderDeps`,
 * so `router.navigate({ search: ... })` only updates the URL — no
 * loader re-run, no RSC re-stream. The swap completes in one React
 * render pass, so we no longer need `useTransition` to keep the old
 * frame interactive. `replace: true` keeps history clean because
 * view-mode swaps are not navigation events the user expects to walk
 * through with the back button.
 */
export function DisplayModeSwitch() {
  const router = useRouter();
  const current = homeRoute.useSearch({ select: selectDisplay });

  const select = (mode: DisplayMode) => {
    if (mode === current) return;
    router.navigate({
      to: "/",
      replace: true,
      // `prev` is the inferred cross-route search union, so the home
      // route's required `page` / `limit` may be `undefined`. Collapse
      // onto `HOME_SEARCH` so the returned shape always satisfies the
      // home schema's required defaults.
      search: (prev) => {
        const p = prev as Partial<NoteListSearch>;
        return {
          ...p,
          page: p.page ?? HOME_SEARCH.page,
          limit: p.limit ?? HOME_SEARCH.limit,
          display: mode,
        };
      },
    });
  };

  return (
    <div role="tablist" aria-label="表示形式" className="inline-flex gap-1">
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
          >
            {LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}
