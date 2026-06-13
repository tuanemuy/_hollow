"use client";

import { useRouterState } from "@tanstack/react-router";
import type { DisplayedNote } from "../loaders";
import { CalendarView } from "./CalendarView";
import { ListView } from "./ListView";
import { TileView } from "./TileView";
import { useEffectiveDisplayMode } from "./useEffectiveDisplayMode";

type Props = Readonly<{
  notes: readonly DisplayedNote[];
}>;

/**
 * Client-side render-mode switcher (Issue #219). Home-route only — the
 * `getRouteApi("/_app/")` binding hard-codes the home schema, so reusing
 * this on another route would require parameterising the route key.
 *
 * The list/tile/calendar choice is URL-driven via `?display=...`, but
 * `display` is excluded from the home route's `loaderDeps` so switching
 * views never refetches data. This component lives on the client side
 * of the boundary so the swap happens within a single React render
 * pass, without a server round-trip.
 *
 * `notes` are forwarded from the server parent so the same data feeds
 * every view variant.
 */
export function NoteListViews({ notes }: Props) {
  const display = useEffectiveDisplayMode();
  // While a filter navigation re-runs the loader, the FilterBar reflects the
  // new selection optimistically; dim the still-stale result list so the
  // pending state reads as "results updating" (Issue #354).
  const isLoading = useRouterState({ select: (s) => s.isLoading });
  const view =
    display === "tile" ? (
      <TileView notes={notes} />
    ) : display === "calendar" ? (
      <CalendarView notes={notes} />
    ) : (
      <ListView notes={notes} />
    );
  // Dim (not disable) the stale list during a filter fetch: selection is
  // client-side state, so it must stay operable while results update.
  return (
    <div
      aria-busy={isLoading || undefined}
      data-pending={isLoading || undefined}
      className="transition-opacity motion-reduce:transition-none data-[pending]:opacity-60"
    >
      {view}
    </div>
  );
}
