"use client";

import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { DisplayMode } from "../constants";
import { readDisplayPreference } from "./displayPreference";
import { selectDisplayRaw } from "./listSelectors";

const homeRoute = getRouteApi("/_app/");

/**
 * Resolve the effective home display mode (Issue #650).
 *
 * Priority (ADR-002): URL `?display=` > localStorage persisted value >
 * default `"list"`. The SavedView `displayMode` slots in above the
 * persisted value automatically because the existing redirect lands it on
 * the URL, so by the time it reaches here it is just the URL value.
 *
 * WHY mount-after-effect (ADR-004): localStorage is unreadable on the
 * server, which always renders the default `"list"`. Reading the persisted
 * value in the `useState` initialiser would diverge between SSR and the
 * first client render and trigger a hydration-mismatch warning. Instead the
 * first client render also yields `"list"` (matching the server) and the
 * persisted value is applied in `useEffect` after mount. The persisted
 * overlay only fires when the URL has no `display`, so an explicit URL /
 * SavedView value is never second-guessed.
 */
export function useEffectiveDisplayMode(): DisplayMode {
  const urlDisplay = homeRoute.useSearch({ select: selectDisplayRaw });
  const [persisted, setPersisted] = useState<DisplayMode | undefined>(
    undefined,
  );
  useEffect(() => {
    setPersisted(readDisplayPreference());
  }, []);
  return urlDisplay ?? persisted ?? "list";
}
