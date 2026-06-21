"use client";

import type { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef } from "react";
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

/**
 * Return shape of {@link useAutosave}.
 *
 * `abortInFlight` is the external abort path consumed by
 * `NoteEditor.onModeChange` when the user picks "discard" in the
 * unsaved-changes confirm dialog (Issue #286). It cancels any in-flight
 * `saveDraft` fetch via `AbortController` and dispatches
 * `autosaveDiscarded` so the AutosaveIndicator returns to `idle` and the
 * retry / debounce bookkeeping is reset. The user's `dirtyKeys` are
 * intentionally preserved — only the in-flight fetch and its UI status
 * are discarded.
 *
 * Calling `abortInFlight()` when nothing is in flight is safe:
 * - `controllerRef.current === null` skips `controller.abort()`
 * - the reducer short-circuits `idle → idle` so no re-render occurs
 * - the dispatched action is still emitted, which is what dismisses a
 *   lingering `error` banner (see ADR-004 of Issue #286).
 *
 * Scope: `abortInFlight` only cancels the `saveDraft` AbortController.
 * `useEditLock`'s `extendLock` cycle and any other server functions
 * driven elsewhere in the editor are unaffected — they own their own
 * lifecycles and are not part of the "discard unsaved content" promise.
 */
export type UseAutosaveReturn = Readonly<{
  abortInFlight: () => void;
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
}: UseAutosaveArgs): UseAutosaveReturn {
  const attemptRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const reRunRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Issue #286: external abort handle. The effect installs its
  // `AbortController` here so `abortInFlight()` can reach across the
  // hook boundary. Teardown clears the slot only when it still owns
  // *this* controller (identity guard) so a stale teardown can't null
  // out a newer effect's controller.
  const controllerRef = useRef<AbortController | null>(null);

  // Snapshot only the fields actually sent on flush; this keeps the
  // autosave effect from restarting when unrelated state slices (e.g.
  // `state.autosave`, `state.editLock`) change. Destructuring `state`
  // gives the lint rule precise dep tracking — passing the whole `state`
  // object would force the effect to depend on the full record.
  //
  // `mode` is pulled out separately and added to the effect deps so
  // mode switches re-mount the effect (Issue #286). Without it, a
  // discard-then-switch transition between two `canFlush=true` modes
  // (e.g. `inline → html` while dirty) would leave the previous effect
  // with an aborted controller and the user's dirty content would not
  // resume autosaving until the next keystroke changed `snapshot`.
  const {
    title,
    contentHtml,
    htmlDraft,
    frontMatter,
    tagNames,
    tagDraft,
    directoryId,
    mode,
  } = state;
  // `mode` / `htmlDraft` participate in the snapshot because the HTML tab
  // persists `minifyHtml(htmlDraft)` rather than `contentHtml` (Issue
  // #762). Without them, an HTML-tab edit (which only touches `htmlDraft`)
  // would not change `snapshot` and autosave would flush a stale body.
  const snapshot = useMemo(
    () =>
      snapshotForSubmit({
        mode,
        title,
        contentHtml,
        htmlDraft,
        frontMatter,
        tagNames,
        tagDraft,
        directoryId,
      }),
    [
      mode,
      title,
      contentHtml,
      htmlDraft,
      frontMatter,
      tagNames,
      tagDraft,
      directoryId,
    ],
  );

  // Hoist the flush gate to the hook body so the effect's dep list does
  // not need to depend on the whole `state` object. This keeps the
  // exhaustive-deps lint satisfied while preserving the same semantics
  // (the effect re-runs when any of these fields change).
  const canFlush = shouldFlushAutosave(state, noteId);

  // `mode` is intentionally in the dep list (see suppression below) so
  // a mode switch re-mounts the effect even when `canFlush` / `snapshot`
  // stay constant. Without it, a discard-then-switch transition between
  // two `canFlush=true` modes (e.g. `inline → html` while dirty) would
  // leave the previous effect with an aborted controller and the user's
  // dirty content would not resume autosaving until the next keystroke
  // changed `snapshot` (Issue #286 review-001 W-F-001).
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above.
  useEffect(() => {
    // When the autosave gate flips off (e.g. WYSIWYG unsupported-tag
    // ack pending), we do not install a controller. The previous
    // effect's teardown already null'd `controllerRef.current` via its
    // identity guard, so `abortInFlight()` is naturally a no-op here.
    if (!canFlush) return;

    const controller = new AbortController();
    const signal = controller.signal;
    controllerRef.current = controller;

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
          // Issue #286: thread the effect's AbortSignal through to the
          // underlying fetch so `controller.abort()` cancels the
          // network request, not just the post-await bookkeeping.
          signal,
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
          // Only clear the slot if it still holds *our* promise — a
          // later schedule() could have abandoned us by aborting the
          // effect and a new effect installing its own promise. Without
          // this guard the stale `.finally` would null out the newer
          // effect's in-flight pointer and let two flushes overlap.
          if (inFlightRef.current === p) inFlightRef.current = null;
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
      // Identity-guarded clear: only null the slot when it still holds
      // *our* controller. A newer effect may have already installed its
      // own controller and we must not clobber it from this teardown.
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [canFlush, mode, noteId, snapshot, dispatch, saveDraft]);

  // Issue #286: external abort path. Stable identity via
  // `useCallback([dispatch])` — `dispatch` is the only non-ref
  // dependency, and `useReducer` guarantees its identity. The refs
  // (`controllerRef`, `timerRef`, etc.) are deliberately omitted from
  // the dep list: `useRef.current` is read at call time and never goes
  // stale within a hook instance.
  //
  // Bookkeeping reset semantics:
  // - `controller.abort()` fires AbortError on the in-flight fetch.
  //   The existing `flush()` catch checks `signal.aborted` before
  //   incrementing `attemptRef`, so a fresh `attemptRef = 0` here is
  //   not racing with a `+= 1` from the abort-induced reject.
  // - `inFlightRef.current` is left for the in-flight promise's
  //   `.finally` identity guard to clear — touching it here would
  //   double the bookkeeping and risk inverting the guard.
  // - `timerRef` / `reRunRef` are cleared so a pending debounce or
  //   re-run flag does not resurrect a flush after the user picked
  //   "discard".
  const abortInFlight = useCallback(() => {
    const controller = controllerRef.current;
    if (controller !== null) {
      controller.abort();
      controllerRef.current = null;
    }
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    reRunRef.current = false;
    attemptRef.current = 0;
    dispatch({ type: "autosaveDiscarded" });
  }, [dispatch]);

  return { abortInFlight };
}
