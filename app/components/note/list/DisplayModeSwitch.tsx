"use client";

import { getRouteApi, useRouter } from "@tanstack/react-router";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import { DISPLAY_MODES, type DisplayMode } from "../constants";
import type { NoteListSearch } from "../schema";
import { selectDisplay } from "./listSelectors";

const LABELS: Record<DisplayMode, string> = {
  list: "リスト",
  tile: "タイル",
  calendar: "カレンダー",
};

const homeRoute = getRouteApi("/_app/");

/**
 * Client-only tab switcher for the list/tile/calendar display mode.
 * Home-route only (`getRouteApi("/_app/")` binds the home schema).
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
      // Issue #215: `noteListSearchSchema` is input-optional for `page`
      // / `limit`, so leaving them out keeps the URL clean (no
      // `?page=1&limit=20`) while the parsed output still receives the
      // schema defaults.
      search: (prev) => ({
        ...(prev as Partial<NoteListSearch>),
        display: mode,
      }),
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
