"use client";

import type { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef } from "react";
import type { saveNoteDraftFn } from "@/components/note/actions";
import { AUTOSAVE_DEBOUNCE_MS } from "@/components/note/constants";
import { extractSerializedError } from "@/core/presentation/errorResponse";
import type { EditorAction, EditorState } from "./editorState";
import { snapshotForSubmit } from "./editorState";

/**
 * Promise-based sleep that rejects with `AbortError` when the given
 * signal is aborted (either pre-aborted at call time, or aborted during
 * the wait). The caller is expected to filter `AbortError` out of its
 * catch block so a cancelled wait does not leak as a retry attempt.
 */
function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("aborted", "AbortError"));
      return;
    }
    const t = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

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

/**
 * Pure predicate that the autosave hook consults before scheduling a
 * flush. Returns `true` only when *every* precondition is met:
 *
 * - The note has been persisted (`noteId !== null`); new-note mode
 *   defers to the explicit `createNote` submit.
 * - Something is actually dirty.
 * - FrontMatter raw JSON parses cleanly.
 * - In WYSIWYG mode with unsupported tags detected, the user has
 *   acknowledged the warning. HTML mode is *not* gated — see ADR-002
 *   for why we let the HTML tab keep saving while the warning is up.
 *
 * `wysiwygUnsupportedAck` is intentionally retained across WYSIWYG
 * editor unmount/remount; the reducer's `setsEqual` latch combined with
 * the `onCreate`-only detection in `WysiwygEditor.tsx` keeps the ack
 * state consistent with the originally-detected tag set (ADR-003 / -005).
 *
 * Exported as a pure function so the gating ladder is unit-testable
 * without mounting the hook (Issue #37).
 */
export function shouldFlushAutosave(
  state: EditorState,
  noteId: string | null,
): boolean {
  if (noteId === null) return false;
  if (state.dirtyKeys.size === 0) return false;
  if (state.frontMatterJsonError !== null) return false;
  if (
    state.mode === "wysiwyg" &&
    state.wysiwygUnsupportedTags.length > 0 &&
    !state.wysiwygUnsupportedAck
  ) {
    return false;
  }
  return true;
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

  // Snapshot only the fields actually sent on flush; this keeps the
  // autosave effect from restarting when unrelated state slices (e.g.
  // `state.autosave`, `state.editLock`) change. Destructuring `state`
  // gives the lint rule precise dep tracking — passing the whole `state`
  // object would force the effect to depend on the full record.
  const { title, contentHtml, frontMatter, tagInput, directoryId } = state;
  const snapshot = useMemo(
    () =>
      snapshotForSubmit({
        title,
        contentHtml,
        frontMatter,
        tagInput,
        directoryId,
      } as EditorState),
    [title, contentHtml, frontMatter, tagInput, directoryId],
  );

  // Hoist the flush gate to the hook body so the effect's dep list does
  // not need to depend on the whole `state` object. This keeps the
  // exhaustive-deps lint satisfied while preserving the same semantics
  // (the effect re-runs when any of these fields change).
  const canFlush = shouldFlushAutosave(state, noteId);

  useEffect(() => {
    if (!canFlush) return;

    const controller = new AbortController();
    const signal = controller.signal;

    const flush = async (): Promise<void> => {
      if (signal.aborted) return;
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
        if (signal.aborted) return;
        attemptRef.current = 0;
        dispatch({ type: "autosaveSuccess", at: Date.now() });
      } catch (e) {
        if (signal.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
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
        try {
          await abortableSleep(wait, signal);
        } catch {
          // abortable sleep cancelled — effect torn down, do not retry.
          return;
        }
        if (signal.aborted) return;
        await flush();
      }
    };

    const schedule = (): void => {
      if (signal.aborted) return;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (signal.aborted) return;
        if (inFlightRef.current !== null) {
          reRunRef.current = true;
          return;
        }
        const p = flush().finally(() => {
          inFlightRef.current = null;
          if (reRunRef.current && !signal.aborted) {
            reRunRef.current = false;
            schedule();
          }
        });
        inFlightRef.current = p;
      }, AUTOSAVE_DEBOUNCE_MS);
    };

    schedule();
    return () => {
      controller.abort();
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [canFlush, noteId, snapshot, dispatch, saveDraft]);
}
