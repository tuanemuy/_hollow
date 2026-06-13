"use client";

import { type RefObject, useEffect, useRef } from "react";

/**
 * Restores focus and caret/selection to a text field after a React commit
 * drops focus to `<body>` (Issue #680). Same mechanism as
 * `useRovingMenu.restoreFocusOnCommit`, generalised to `<input>` /
 * `<textarea>` and extended to restore the selection range.
 *
 * WHY: the editing forms under `/_app/views` (inline rename), `/admin/prompts`
 * and `/_app/settings/prompts` render their `component` straight from
 * `Route.useLoaderData()` (the `renderServerComponent(...)` RSC payload). When
 * `routerInvalidate(router)` fires — the live path is the AppShell-resident
 * `UploadDialog` completing an upload — the loader
 * (`staleTime: 0`) re-runs and a fresh RSC payload is reconciled into the SAME
 * client component instance. #670 Step 0 confirmed the node is NOT remounted
 * and `useState` is preserved (so the input value survives), yet the focused
 * subtree is momentarily detached during the commit and the browser drops
 * focus to `<body>` (its `focusout` carries `relatedTarget: null`). The only
 * reliable hook point is "after a commit, refs re-attached": check and
 * refocus here.
 *
 * Snapshot timing (the core of the design): by the time the post-commit
 * `useEffect` runs, `activeElement` is already `<body>`, so reading the
 * selection from `activeElement` there is too late. Instead the selection is
 * snapshotted continuously WHILE the field holds focus (the returned handlers,
 * plus a mandatory final save on `focusout`/`blur`), and the restore uses that
 * held snapshot. Restore (post-commit effect) and capture (event-driven) are
 * deliberately kept separate.
 *
 * Fallback: if no snapshot was ever captured (e.g. an `autoFocus`-opened field
 * hit by an invalidate before any interaction), focus is restored but
 * `setSelectionRange` is NOT called — the caret is never force-jumped to the
 * end/start.
 *
 * IME: while a composition is in progress, `setSelectionRange` would break the
 * conversion session, so restore is suppressed until `compositionend`.
 *
 * The restore guard (`activeElement === document.body` + a "we held focus
 * before" flag) keeps this from stealing focus on window blur (there the field
 * stays `activeElement`) or from a user who moved focus elsewhere (then
 * `activeElement` is that other element, not `<body>`). The "held focus" flag
 * is armed two ways: from the focus/selection events AND from the post-commit
 * `activeElement` — `autoFocus` (and any programmatic focus) does NOT fire
 * React's synthetic `onFocus`, so an `autoFocus`-opened field never interacted
 * with would otherwise never arm and would not be restored (Issue #680
 * browser gate E-1). `preventScroll: true`
 * mirrors `useRovingMenu`: the restore may race a user scroll and
 * the default scroll-into-view would yank the list back. Note that, as with
 * roving menu's clamped index, the commit that dropped focus may also have
 * changed the field's value; `setSelectionRange` clamps offsets to the current
 * value length, so a stale snapshot can never throw.
 */
export type UseRestoreFieldFocusOnCommit<
  T extends HTMLInputElement | HTMLTextAreaElement,
> = Readonly<{
  ref: RefObject<T | null>;
  /**
   * Spread onto the field. Captures the selection snapshot while focused and
   * tracks the IME composition / "held focus" flags. Does not interfere with
   * the field's own `onChange` (these are distinct handler props).
   */
  handlers: Readonly<{
    onSelect: () => void;
    onKeyUp: () => void;
    onMouseUp: () => void;
    onInput: () => void;
    onFocus: () => void;
    onBlur: () => void;
    onCompositionStart: () => void;
    onCompositionEnd: () => void;
  }>;
}>;

type Snapshot = Readonly<{
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
}>;

export function useRestoreFieldFocusOnCommit<
  T extends HTMLInputElement | HTMLTextAreaElement,
>(): UseRestoreFieldFocusOnCommit<T> {
  const ref = useRef<T | null>(null);
  // Latest selection while the field is focused. Null until the first capture.
  const snapshotRef = useRef<Snapshot | null>(null);
  // Whether the field held focus just before the current commit. Gates the
  // restore so we never pull focus into a field the user never touched.
  const hadFocusRef = useRef(false);
  // IME guard: suppress restore between compositionstart and compositionend.
  const composingRef = useRef(false);

  const capture = () => {
    const el = ref.current;
    if (el === null) return;
    if (document.activeElement !== el) return;
    hadFocusRef.current = true;
    const { selectionStart, selectionEnd, selectionDirection } = el;
    if (selectionStart === null || selectionEnd === null) return;
    snapshotRef.current = {
      start: selectionStart,
      end: selectionEnd,
      direction: selectionDirection ?? "none",
    };
  };

  // Restore pass, run after EVERY commit (no dep array). When a commit drops
  // focus to <body>, refocus the field and re-apply the held selection.
  useEffect(() => {
    const el = ref.current;
    if (
      !composingRef.current &&
      hadFocusRef.current &&
      el !== null &&
      el.isConnected &&
      document.activeElement === document.body
    ) {
      el.focus({ preventScroll: true });
      const snapshot = snapshotRef.current;
      if (snapshot !== null) {
        el.setSelectionRange(snapshot.start, snapshot.end, snapshot.direction);
      }
    }
    // Arm "held focus" from the post-commit activeElement: autoFocus / any
    // programmatic focus does not fire React's onFocus, so the event-driven
    // captures alone miss an autoFocus-opened field not yet interacted with.
    // Also keeps the flag set after a restore refocus above.
    if (el !== null && document.activeElement === el) {
      hadFocusRef.current = true;
    }
  });

  return {
    ref,
    handlers: {
      onSelect: capture,
      onKeyUp: capture,
      onMouseUp: capture,
      onInput: capture,
      onFocus: capture,
      // Final save on the way out: the event-driven captures cover the common
      // caret-move paths, but a focus-then-invalidate with no interaction
      // would leave the snapshot empty; this guarantees one last capture.
      onBlur: () => {
        const el = ref.current;
        if (el === null) return;
        const { selectionStart, selectionEnd, selectionDirection } = el;
        if (selectionStart === null || selectionEnd === null) return;
        snapshotRef.current = {
          start: selectionStart,
          end: selectionEnd,
          direction: selectionDirection ?? "none",
        };
      },
      onCompositionStart: () => {
        composingRef.current = true;
      },
      onCompositionEnd: () => {
        composingRef.current = false;
        capture();
      },
    },
  };
}
