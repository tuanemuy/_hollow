"use client";

import { useEffect, useRef } from "react";
import {
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
 * On mount the hook calls `acquireEditLockFn`. The error branches are
 * exhaustive per the plan:
 *   - `business` + code `edit_locked_by_other` → dispatch `editLockDenied`
 *     and let the banner surface the warning. Editing remains permitted.
 *   - `forbidden` (`NOTE_FORBIDDEN`) / `not_found` (`NOTE_NOT_FOUND`)
 *     are re-thrown so the route's error boundary can take over.
 *   - Anything else is logged and treated as denied so the editor stays
 *     usable but the user knows the lock is not guaranteed.
 *
 * Renewal runs on a `setInterval` until unmount or a denial. Unmount /
 * blur releases the lock; tab-close is intentionally left to the TTL
 * (no `sendBeacon` — ADR-006).
 */
export type UseEditLockArgs = Readonly<{
  noteId: string | null;
  dispatch: React.Dispatch<EditorAction>;
}>;

const HELD_BY_OTHER_CODES = new Set<string>([
  "edit_locked_by_other",
  "edit_lock_held_by_other",
]);

function isHeldByOther(err: SerializedError): boolean {
  return err.kind === "business" && HELD_BY_OTHER_CODES.has(err.code ?? "");
}

function shouldRethrow(err: SerializedError): boolean {
  return err.kind === "forbidden" || err.kind === "notFound";
}

function expiresAtToMs(value: string | null): number | null {
  if (value === null) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

export function useEditLock({ noteId, dispatch }: UseEditLockArgs) {
  const mountedRef = useRef(true);
  const acquiredRef = useRef(false);

  useEffect(() => {
    if (noteId === null) return;
    mountedRef.current = true;
    let interval: ReturnType<typeof setInterval> | null = null;

    const acquire = async () => {
      try {
        const result = await acquireEditLockFn({ data: { noteId } });
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
        const result = await extendEditLockFn({ data: { noteId } });
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

    const onBlur = () => {
      if (!acquiredRef.current) return;
      void releaseEditLockFn({ data: { noteId } }).catch(() => {
        // Release is best-effort; the TTL covers any failure.
      });
    };

    void acquire().then(() => {
      if (!mountedRef.current) return;
      interval = setInterval(() => {
        void extend();
      }, EDIT_LOCK_RENEW_INTERVAL_MS);
    });

    if (typeof window !== "undefined") {
      window.addEventListener("blur", onBlur);
    }

    return () => {
      mountedRef.current = false;
      if (interval !== null) clearInterval(interval);
      if (typeof window !== "undefined") {
        window.removeEventListener("blur", onBlur);
      }
      if (acquiredRef.current) {
        acquiredRef.current = false;
        void releaseEditLockFn({ data: { noteId } }).catch(() => {
          // Release is best-effort; the TTL covers any failure.
        });
        dispatch({ type: "editLockReleased" });
      }
    };
  }, [noteId, dispatch]);
}
