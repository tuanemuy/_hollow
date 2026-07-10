"use client";

import { useRouterState } from "@tanstack/react-router";
import { ROUTE_PROGRESS_BAR, ROUTE_PROGRESS_BAR_FILL } from "./styles";

/**
 * Global route-transition progress bar (Issue #819).
 *
 * Subscribes to the router's `isLoading` — which flips to `true`
 * synchronously when a navigation commit begins — and paints a thin accent
 * bar across the top of the viewport for the duration of the loader
 * round-trip. This gives an immediate "navigating" cue on every route,
 * including mobile where intent preload does not fire, so the click→shell
 * gap is never a blank no-op.
 *
 * Purely decorative (`aria-hidden`): the bar carries no `role`/`aria-live`.
 * Load announcements for screen readers are owned by each page's skeleton
 * `aria-live` (`NoteDetailSkeleton`/`NoteEditorSkeleton`, …); a live region
 * here would double-announce on every navigation. See `.issue/819/adr.md`
 * ADR-002.
 *
 * Show/hide and reduced-motion behaviour live entirely in the CSS variants on
 * `ROUTE_PROGRESS_BAR` — no JS delay timer — so the bar appears without any
 * artificial latency.
 */
export function RouteProgressBar() {
  const isLoading = useRouterState({ select: (s) => s.isLoading });
  return (
    <div
      aria-hidden="true"
      data-loading={isLoading || undefined}
      className={ROUTE_PROGRESS_BAR}
    >
      <div className={ROUTE_PROGRESS_BAR_FILL} />
    </div>
  );
}
