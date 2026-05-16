"use client";

import type { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import type {
  acquireEditLockFn,
  extendEditLockFn,
  releaseEditLockFn,
} from "@/components/note/actions";
import { EDIT_LOCK_RENEW_INTERVAL_MS } from "@/components/note/constants";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import type { EditorAction } from "./editorState";

/**
 * Edit-lock orchestration for the editor (best-effort, see ADR-006).
 *
 * On mount the hook calls the supplied `acquireLock`. The error branches
 * are exhaustive per the plan:
 *   - `business` + code `edit_locked_by_other` → dispatch `editLockDenied`
 *     and let the banner surface the warning. Editing remains permitted.
 *   - `forbidden` (`NOTE_FORBIDDEN`) / `not_found` (`NOTE_NOT_FOUND`)
 *     are re-thrown so the route's error boundary can take over.
 *   - Anything else is logged and treated as denied so the editor stays
 *     usable but the user knows the lock is not guaranteed.
 *
 * Renewal runs on a `setInterval` until unmount or a denial. **Only**
 * unmount releases the lock — tab-close / blur / pagehide are
 * intentionally not wired and the TTL covers those cases (see PR #7
 * Round 1 Blocker W-002).
 *
 * The three server functions are supplied by the caller as
 * `useServerFn(...)` return values so the wrapper's redirect / session
 * handling stays in effect; the hook never imports the raw server fns
 * directly (PR #7 Round 1 Blocker B-001).
 */
type AcquireEditLockServerFn = ReturnType<
  typeof useServerFn<typeof acquireEditLockFn>
>;
type ExtendEditLockServerFn = ReturnType<
  typeof useServerFn<typeof extendEditLockFn>
>;
type ReleaseEditLockServerFn = ReturnType<
  typeof useServerFn<typeof releaseEditLockFn>
>;

export type UseEditLockArgs = Readonly<{
  noteId: string | null;
  dispatch: React.Dispatch<EditorAction>;
  acquireLock: AcquireEditLockServerFn;
  extendLock: ExtendEditLockServerFn;
  releaseLock: ReleaseEditLockServerFn;
}>;

const HELD_BY_OTHER_CODES = new Set<string>([
  "edit_locked_by_other",
  "edit_lock_held_by_other",
]);

/**
 * Recognises the two business-error codes the lock usecase emits when
 * another session holds the lock. Exported as a pure helper so the
 * branching policy is exercisable from vitest without mounting the hook.
 */
export function isHeldByOther(err: SerializedError): boolean {
  return err.kind === "business" && HELD_BY_OTHER_CODES.has(err.code ?? "");
}

/**
 * `forbidden` / `notFound` errors during lock acquire / extend should
 * bubble up to the route's error boundary rather than being swallowed
 * into the "denied" banner. Exported for unit coverage.
 */
export function shouldRethrow(err: SerializedError): boolean {
  return err.kind === "forbidden" || err.kind === "notFound";
}

/**
 * Convert an ISO timestamp string into epoch-ms, defending against
 * malformed input. `null` propagates through and unparseable strings
 * collapse to `null` so the reducer never receives `NaN`.
 */
export function expiresAtToMs(value: string | null): number | null {
  if (value === null) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

export function useEditLock({
  noteId,
  dispatch,
  acquireLock,
  extendLock,
  releaseLock,
}: UseEditLockArgs) {
  const mountedRef = useRef(true);
  const acquiredRef = useRef(false);

  useEffect(() => {
    if (noteId === null) return;
    mountedRef.current = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    const acquire = async () => {
      try {
        const result = await acquireLock({ data: { noteId } });
        if (!mountedRef.current) return;
        acquiredRef.current = true;
        dispatch({
          type: "editLockAcquired",
          lockId: null,
          expiresAt: expiresAtToMs(result.expiresAt),
        });
      } catch (e) {
        const err = extractSerializedError(e);
        if (shouldRethrow(err)) throw e;
        if (!mountedRef.current) return;
        if (isHeldByOther(err)) {
          dispatch({ type: "editLockDenied", expiresAt: null });
          return;
        }
        if (typeof console !== "undefined") {
          console.warn("[useEditLock] acquire failed", err);
        }
        dispatch({ type: "editLockDenied", expiresAt: null });
      }
    };

    const extend = async () => {
      if (!acquiredRef.current) return;
      try {
        const result = await extendLock({ data: { noteId } });
        if (!mountedRef.current) return;
        dispatch({
          type: "editLockAcquired",
          lockId: null,
          expiresAt: expiresAtToMs(result.expiresAt),
        });
      } catch (e) {
        const err = extractSerializedError(e);
        if (shouldRethrow(err)) throw e;
        if (!mountedRef.current) return;
        if (isHeldByOther(err)) {
          acquiredRef.current = false;
          dispatch({ type: "editLockDenied", expiresAt: null });
          return;
        }
        if (typeof console !== "undefined") {
          console.warn("[useEditLock] extend failed", err);
        }
      }
    };

    void acquire().then(() => {
      if (!mountedRef.current) return;
      interval = setInterval(() => {
        void extend();
      }, EDIT_LOCK_RENEW_INTERVAL_MS);
    });

    return () => {
      mountedRef.current = false;
      if (interval !== null) clearInterval(interval);
      if (acquiredRef.current) {
        acquiredRef.current = false;
        void releaseLock({ data: { noteId } }).catch(() => {
          // Release is best-effort; the TTL covers any failure.
        });
        dispatch({ type: "editLockReleased" });
      }
    };
  }, [noteId, dispatch, acquireLock, extendLock, releaseLock]);
}
