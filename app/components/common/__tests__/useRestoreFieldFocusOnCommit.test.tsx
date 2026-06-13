// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRestoreFieldFocusOnCommit } from "../useRestoreFieldFocusOnCommit";

/**
 * Issue #680: pins the restore/non-restore branches of
 * `useRestoreFieldFocusOnCommit`. jsdom/happy-dom cannot faithfully reproduce
 * the RSC commit-time subtree detach that drops focus to `<body>`, so we
 * simulate it: a re-render is the "commit", and we set
 * `document.activeElement` to `<body>` by hand to stand in for the drop. The
 * integration behaviour is covered by the manual/browser gate (plan step 7).
 *
 * happy-dom note: a programmatic `field.focus()` DOES fire React's synthetic
 * `onFocus` here (unlike a real browser's `autoFocus`, which focuses before
 * React wires its handlers). So any Probe that spreads `{...handlers}` will
 * have its `capture()` run on focus and a snapshot will exist. To exercise the
 * snapshot-less fallback branch we use `ProbeNoHandlers`, which omits the
 * selection-capturing handlers: focus still arms the "held focus" flag via the
 * post-commit `activeElement === el` path, but no snapshot is ever taken.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ tick, show = true }: { tick: number; show?: boolean }) {
  const { ref, handlers } = useRestoreFieldFocusOnCommit<HTMLInputElement>();
  if (!show) return null;
  return (
    <input
      ref={ref}
      data-testid="field"
      data-tick={tick}
      defaultValue="hello world"
      {...handlers}
    />
  );
}

/**
 * Variant that spreads the field's `ref` but NOT the selection-capturing
 * handlers. Used to drive the snapshot-less fallback: the field can hold focus
 * (arming `hadFocusRef` from the post-commit `activeElement` path) while
 * `snapshotRef` stays null because no `onFocus`/`onSelect`/… ever runs
 * `capture()`. Pins the `if (snapshot !== null)` false branch.
 */
function ProbeNoHandlers({
  tick,
  show = true,
}: {
  tick: number;
  show?: boolean;
}) {
  const { ref } = useRestoreFieldFocusOnCommit<HTMLInputElement>();
  if (!show) return null;
  return (
    <input
      ref={ref}
      data-testid="field"
      data-tick={tick}
      defaultValue="hello world"
    />
  );
}

let container: HTMLDivElement;
let root: Root;
let other: HTMLButtonElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  other = document.createElement("button");
  document.body.appendChild(other);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  other.remove();
});

function getField(): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>("[data-testid='field']");
  if (el === null) throw new Error("field not rendered");
  return el;
}

function commit(tick: number, show = true) {
  act(() => {
    root.render(<Probe tick={tick} show={show} />);
  });
}

function commitNoHandlers(tick: number, show = true) {
  act(() => {
    root.render(<ProbeNoHandlers tick={tick} show={show} />);
  });
}

describe("useRestoreFieldFocusOnCommit", () => {
  it("restores focus and the captured selection when focus dropped to <body>", () => {
    commit(0);
    const field = getField();
    field.focus();
    field.setSelectionRange(2, 5, "forward");
    // capture the snapshot via a user-event handler while focused
    field.dispatchEvent(new Event("select", { bubbles: true }));

    // Simulate the commit-time drop to <body>, then re-render (the commit).
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    commit(1);

    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(2);
    expect(field.selectionEnd).toBe(5);
  });

  it("does not restore when the user moved focus to another element", () => {
    commit(0);
    const field = getField();
    field.focus();
    field.dispatchEvent(new Event("select", { bubbles: true }));

    other.focus();
    expect(document.activeElement).toBe(other);
    commit(1);

    expect(document.activeElement).toBe(other);
  });

  it("does not restore when the field never held focus", () => {
    commit(0);
    other.focus();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    commit(1);

    expect(document.activeElement).toBe(document.body);
  });

  it("does nothing when the field is removed from the tree on the next commit (null guard)", () => {
    commit(0);
    const field = getField();
    field.focus();
    field.dispatchEvent(new Event("select", { bubbles: true }));
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);

    // Rendering with show=false unmounts the input, so React nulls the ref:
    // `ref.current` becomes null. This exercises the `el !== null` guard
    // (NOT the `isConnected` guard — that one is pinned separately below).
    expect(() => commit(1, false)).not.toThrow();
    expect(container.querySelector("[data-testid='field']")).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("does nothing when the field stays mounted but is disconnected from the document (isConnected guard)", () => {
    commit(0);
    const field = getField();
    field.focus();
    field.dispatchEvent(new Event("select", { bubbles: true }));
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);

    // Detach the whole React container from the document. The input stays
    // mounted (React keeps tracking it, so `ref.current` is still the field —
    // distinct from the null-guard case above), but `field.isConnected` is now
    // false. The restore pass must short-circuit on the `el.isConnected` guard.
    container.remove();
    expect(field.isConnected).toBe(false);
    const focusSpy = vi.spyOn(field, "focus");

    expect(() => commit(1)).not.toThrow();
    expect(focusSpy).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });

  it("restores focus only (never calls setSelectionRange) when no snapshot was captured", () => {
    commitNoHandlers(0);
    const field = getField();
    // ProbeNoHandlers spreads no selection-capturing handlers, so focusing the
    // field never runs `capture()` and `snapshotRef` stays null. The "held
    // focus" flag is still armed from the post-commit `activeElement === el`
    // path on the next commit.
    field.focus();
    const setSelectionSpy = vi.spyOn(field, "setSelectionRange");
    commitNoHandlers(1);

    // Drop to <body>, then commit: focus is restored via the activeElement-armed
    // flag, but with no snapshot the caret is left untouched (setSelectionRange
    // is never called — the fallback branch).
    field.blur();
    expect(document.activeElement).toBe(document.body);
    commitNoHandlers(2);

    expect(document.activeElement).toBe(field);
    expect(setSelectionSpy).not.toHaveBeenCalled();
  });

  it("restores an autoFocus-style field armed only from the post-commit activeElement", () => {
    commitNoHandlers(0);
    const field = getField();
    // Stand in for autoFocus: in a real browser autoFocus focuses before React
    // wires its synthetic handlers, so no `onFocus` fires. ProbeNoHandlers
    // reproduces that here — focusing fires no React handler that would arm the
    // flag, so the flag can ONLY be armed from the post-commit `activeElement`
    // path. This is the load-bearing path fixed for browser gate E-1.
    field.focus();
    const setSelectionSpy = vi.spyOn(field, "setSelectionRange");
    commitNoHandlers(1);

    // invalidate-style drop to <body>.
    field.blur();
    expect(document.activeElement).toBe(document.body);
    commitNoHandlers(2);

    // focus is restored purely from the activeElement-armed flag; no snapshot was
    // captured, so setSelectionRange is never called (caret left to the browser).
    expect(document.activeElement).toBe(field);
    expect(setSelectionSpy).not.toHaveBeenCalled();
  });

  it("suppresses restore during an IME composition and resumes after compositionend", () => {
    commit(0);
    const field = getField();
    field.focus();
    field.setSelectionRange(1, 4, "forward");
    field.dispatchEvent(new Event("select", { bubbles: true }));
    act(() => {
      field.dispatchEvent(
        new CompositionEvent("compositionstart", { bubbles: true }),
      );
    });

    // During composition the restore is suppressed: focus stays on <body>.
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    commit(1);
    expect(document.activeElement).toBe(document.body);

    // compositionend clears the guard and re-captures the snapshot; the next
    // commit resumes the restore and re-applies the caret. Guards against a
    // `composingRef` that is never cleared (which would suppress forever).
    act(() => {
      field.dispatchEvent(
        new CompositionEvent("compositionend", { bubbles: true }),
      );
    });
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    commit(2);

    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(1);
    expect(field.selectionEnd).toBe(4);
  });

  it("does not restore on window-blur-like state where the field stays activeElement", () => {
    commit(0);
    const field = getField();
    field.focus();
    field.setSelectionRange(0, 2, "forward");
    field.dispatchEvent(new Event("select", { bubbles: true }));

    // activeElement stays the field (no drop to body) — restore must no-op.
    expect(document.activeElement).toBe(field);
    field.setSelectionRange(6, 6, "none");
    commit(1);

    // restore did not run, so the caret the user/page set is left untouched
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(6);
    expect(field.selectionEnd).toBe(6);
  });
});
