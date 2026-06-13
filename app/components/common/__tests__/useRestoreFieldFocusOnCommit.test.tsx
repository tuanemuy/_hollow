// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useRestoreFieldFocusOnCommit } from "../useRestoreFieldFocusOnCommit";

/**
 * Issue #680: pins the restore/non-restore branches of
 * `useRestoreFieldFocusOnCommit`. jsdom/happy-dom cannot faithfully reproduce
 * the RSC commit-time subtree detach that drops focus to `<body>`, so we
 * simulate it: a re-render is the "commit", and we set
 * `document.activeElement` to `<body>` by hand to stand in for the drop. The
 * integration behaviour is covered by the manual/browser gate (plan step 7).
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

  it("does nothing when the field is gone from the tree on the next commit", () => {
    commit(0);
    const field = getField();
    field.focus();
    field.dispatchEvent(new Event("select", { bubbles: true }));
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);

    // The field is removed in the same commit that would restore it; the
    // null/`isConnected` guards keep the restore pass from crashing.
    expect(() => commit(1, false)).not.toThrow();
    expect(container.querySelector("[data-testid='field']")).toBeNull();
    expect(document.activeElement).toBe(document.body);
  });

  it("restores focus only (no setSelectionRange) when no snapshot was captured", () => {
    commit(0);
    const field = getField();
    // Focus without any selection-capturing event, then drop to body.
    field.focus();
    field.setSelectionRange(3, 3, "none");
    // hadFocus flag is set via onFocus capture, but snapshot reflects the
    // focus-time caret. Move the real caret elsewhere to prove the restore
    // does NOT force the snapshot when none was meaningfully captured.
    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    commit(1);

    // focus is restored; we only assert the element is focused (caret behaviour
    // when a focus-time snapshot exists is exercised in the first test).
    expect(document.activeElement).toBe(field);
  });

  it("restores an autoFocus-style field armed only from the post-commit activeElement", () => {
    commit(0);
    const field = getField();
    // Stand in for autoFocus: the field holds focus across a commit without any
    // React onFocus / selection event ever firing (autoFocus focuses before
    // React wires its synthetic handlers, so the event-driven captures miss it).
    field.focus();
    commit(1);

    // invalidate-style drop to <body>.
    field.blur();
    expect(document.activeElement).toBe(document.body);
    commit(2);

    // focus is restored from the activeElement-armed flag (no snapshot was
    // captured, so the caret is left to the browser default — not force-jumped).
    expect(document.activeElement).toBe(field);
  });

  it("does not restore while an IME composition is in progress", () => {
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

    (document.activeElement as HTMLElement | null)?.blur();
    expect(document.activeElement).toBe(document.body);
    commit(1);

    // composition guard suppresses restore
    expect(document.activeElement).toBe(document.body);
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
