"use client";

import type { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import type { saveNoteDraftFn } from "@/components/note/actions";
import { AUTOSAVE_DEBOUNCE_MS } from "@/components/note/constants";
import { extractSerializedError } from "@/core/presentation/errorResponse";
import type { EditorAction, EditorState } from "./editorState";
import { snapshotForSubmit } from "./editorState";

/**
 * Drive `saveNoteDraft` from the reducer state.
 *
 * Triggers a debounced flush whenever `dirtyKeys` is non-empty and the
 * FrontMatter raw text parses cleanly. Failures retry with exponential
 * backoff up to `MAX_ATTEMPTS`. New-note mode (`noteId === null`) skips
 * autosave entirely — the explicit submit handler owns the first
 * `createNote` call.
 *
 * The server function is supplied by the caller as the
 * `useServerFn(saveNoteDraftFn)` return value so the `useServerFn`
 * wrapper's redirect / session-handling stays in effect; the hook itself
 * never imports the raw `saveNoteDraftFn` directly. (See PR #7 Round 1
 * Blocker B-001.)
 *
 * The hook is intentionally a no-op until the editor lock is in a
 * non-error state; that keeps the autosave engine from racing the
 * acquire/release flow during mount.
 */
type SaveNoteDraftServerFn = ReturnType<
  typeof useServerFn<typeof saveNoteDraftFn>
>;

export type UseAutosaveArgs = Readonly<{
  noteId: string | null;
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  saveDraft: SaveNoteDraftServerFn;
}>;

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;

/**
 * Exponential backoff wait (ms) for autosave retry attempts.
 * `attempt` is 1-based: the first retry waits `BACKOFF_BASE_MS`, the
 * second waits `BACKOFF_BASE_MS * 2`, and so on. Values below 1 collapse
 * to `0` so callers can pass the raw `attemptRef.current` without
 * guarding. Exported as a pure helper for unit coverage.
 */
export function backoffWaitMs(attempt: number): number {
  if (attempt < 1) return 0;
  return BACKOFF_BASE_MS * 2 ** (attempt - 1);
}

/**
 * Predicate: should the autosave loop give up after observing this
 * attempt count? Exported so the limit ladder is testable without
 * mounting the hook.
 */
export function isAutosaveExhausted(attempt: number): boolean {
  return attempt >= MAX_ATTEMPTS;
}

export function useAutosave({
  noteId,
  state,
  dispatch,
  saveDraft,
}: UseAutosaveArgs) {
  const attemptRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const reRunRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (noteId === null) return;
    if (state.dirtyKeys.size === 0) return;
    if (state.frontMatterJsonError !== null) return;

    const flush = async () => {
      if (!mountedRef.current) return;
      const snapshot = snapshotForSubmit(state);
      dispatch({ type: "autosaveStart" });
      try {
        await saveDraft({
          data: {
            noteId,
            title: snapshot.title,
            contentHtml: snapshot.contentHtml,
            frontMatterJson: snapshot.frontMatterJson,
          },
        });
        if (!mountedRef.current) return;
        attemptRef.current = 0;
        dispatch({ type: "autosaveSuccess", at: Date.now() });
      } catch (e) {
        if (!mountedRef.current) return;
        attemptRef.current += 1;
        if (isAutosaveExhausted(attemptRef.current)) {
          attemptRef.current = 0;
          dispatch({
            type: "autosaveError",
            error: extractSerializedError(e),
          });
          return;
        }
        const wait = backoffWaitMs(attemptRef.current);
        await new Promise((r) => setTimeout(r, wait));
        if (!mountedRef.current) return;
        await flush();
      }
    };

    const schedule = () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (inFlightRef.current !== null) {
          reRunRef.current = true;
          return;
        }
        const p = flush().finally(() => {
          inFlightRef.current = null;
          if (reRunRef.current && mountedRef.current) {
            reRunRef.current = false;
            schedule();
          }
        });
        inFlightRef.current = p;
      }, AUTOSAVE_DEBOUNCE_MS);
    };

    schedule();
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [noteId, state, dispatch, saveDraft]);
}
