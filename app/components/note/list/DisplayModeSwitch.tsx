"use client";

import { getRouteApi, useRouter } from "@tanstack/react-router";
import { Calendar, LayoutGrid, List, type LucideIcon } from "lucide-react";
import { DISPLAY_MODES, type DisplayMode } from "../constants";
import { homeSearchUpdater } from "./homeSearch";
import { selectDisplay } from "./listSelectors";
import { DISPLAY_SEGMENTED, DISPLAY_SEGMENTED_BTN } from "./styles";

// アイコンのみ表示（#626 ADR-001）のため `aria-label` / `title` 用のラベル。
const LABELS: Record<DisplayMode, string> = {
  list: "リスト",
  tile: "タイル",
  calendar: "カレンダー",
};

const ICONS: Record<DisplayMode, LucideIcon> = {
  list: List,
  tile: LayoutGrid,
  calendar: Calendar,
};

const homeRoute = getRouteApi("/_app/");

/**
 * Client-only tab switcher for the list/tile/calendar display mode.
 * Home-route only (`getRouteApi("/_app/")` binds the home schema).
 *
 * Issue #219: `display` is excluded from the home route's `loaderDeps`,
 * so `router.navigate({ search: ... })` only updates the URL — no
 * loader re-run, no RSC re-stream. The swap completes in one React
 * render pass, so no `useTransition` is needed to keep the old
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
      search: (prev) => homeSearchUpdater(prev, { display: mode }),
    });
  };

  return (
    <div role="tablist" aria-label="表示形式" className={DISPLAY_SEGMENTED}>
      {DISPLAY_MODES.map((mode) => {
        const active = mode === current;
        const IconComponent = ICONS[mode];
        return (
          <button
            key={mode}
            role="tab"
            type="button"
            aria-selected={active}
            aria-label={LABELS[mode]}
            title={LABELS[mode]}
            data-active={active || undefined}
            className={DISPLAY_SEGMENTED_BTN}
            onClick={() => select(mode)}
          >
            <IconComponent
              className="size-[var(--icon-xs)]"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}
