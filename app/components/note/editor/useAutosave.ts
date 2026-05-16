"use client";

import { useEffect, useRef } from "react";
import { saveNoteDraftFn } from "@/components/note/actions";
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
 * The hook is intentionally a no-op until the editor lock is in a
 * non-error state; that keeps the autosave engine from racing the
 * acquire/release flow during mount.
 */
export type UseAutosaveArgs = Readonly<{
  noteId: string | null;
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}>;

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;

export function useAutosave({ noteId, state, dispatch }: UseAutosaveArgs) {
  const attemptRef = useRef(0);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const reRunRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (noteId === null) return;
    if (state.dirtyKeys.size === 0) return;
    if (state.frontMatterJsonError !== null) return;

    const flush = async () => {
      const snapshot = snapshotForSubmit(state);
      dispatch({ type: "autosaveStart" });
      try {
        await saveNoteDraftFn({
          data: {
            noteId,
            title: snapshot.title,
            contentHtml: snapshot.contentHtml,
            frontMatterJson: snapshot.frontMatterJson,
          },
        });
        attemptRef.current = 0;
        dispatch({ type: "autosaveSuccess", at: Date.now() });
      } catch (e) {
        attemptRef.current += 1;
        if (attemptRef.current >= MAX_ATTEMPTS) {
          attemptRef.current = 0;
          dispatch({
            type: "autosaveError",
            error: extractSerializedError(e),
          });
          return;
        }
        const wait = BACKOFF_BASE_MS * 2 ** (attemptRef.current - 1);
        await new Promise((r) => setTimeout(r, wait));
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
          if (reRunRef.current) {
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
  }, [noteId, state, dispatch]);
}
