"use client";

import { getRouteApi } from "@tanstack/react-router";
import type { DisplayMode } from "../constants";
import type { DisplayedNote } from "../loaders";
import { CalendarView } from "./CalendarView";
import { ListView } from "./ListView";
import { TileView } from "./TileView";

type Props = Readonly<{
  notes: readonly DisplayedNote[];
}>;

const homeRoute = getRouteApi("/");

const selectDisplay = (s: { display?: DisplayMode | undefined }): DisplayMode =>
  s.display ?? "list";

/**
 * Client-side render-mode switcher (Issue #219).
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
  const display = homeRoute.useSearch({ select: selectDisplay });
  if (display === "tile") return <TileView notes={notes} />;
  if (display === "calendar") return <CalendarView notes={notes} />;
  return <ListView notes={notes} />;
}
