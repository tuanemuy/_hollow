// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useRovingTablist } from "../useRovingTablist";

/**
 * Issue #781: pins the focus-restore branches of `useRovingTablist`'s
 * automatic-activation `restoreFocusOnCommit` opt-in. happy-dom cannot
 * reproduce the RSC commit-time subtree swap that drops focus to `<body>`, so
 * we simulate it: a re-render is the "commit", and we set
 * `document.activeElement` by hand to stand in for the drop. The integration
 * behaviour is covered by the manual/browser gate (plan step 4).
 *
 * The keyboard-intent flag (`restorePendingRef`) has three post-commit
 * branches that are hard to exercise via a data-driven consumer, so they are
 * pinned directly here: (a) the synchronous arrow focus still holds the target
 * → keep the flag, no hijack; (b) focus dropped to `<body>` → restore + clear;
 * (c) the user moved focus elsewhere → clear without restoring.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS = ["a", "b", "c"] as const;
const COUNT = ITEMS.length;

function Harness({
  initialIndex,
  restore,
}: {
  initialIndex: number;
  restore: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState(initialIndex);
  // Automatic activation; opt into restore via the prop so the AC-4 regression
  // (restore=false) and the restore branches share one harness.
  const roving = useRovingTablist({
    count: COUNT,
    selectedIndex,
    onSelect: (i) => setSelectedIndex(i),
    restoreFocusOnCommit: restore,
  });
  return (
    <div
      ref={roving.containerRef}
      role="radiogroup"
      aria-label="harness"
      onKeyDown={roving.onKeyDown}
    >
      {ITEMS.map((id, i) => (
        // biome-ignore lint/a11y/useSemanticElements: mirrors TagListToolbar's APG Radio Group (button + role="radio") under test
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={i === selectedIndex}
          tabIndex={roving.getTabIndex(i)}
        >
          {id}
        </button>
      ))}
    </div>
  );
}

let container: HTMLDivElement;
let root: Root;
let outside: HTMLButtonElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  outside = document.createElement("button");
  document.body.appendChild(outside);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  outside.remove();
});

function render(initialIndex: number, restore: boolean) {
  act(() => {
    root.render(<Harness initialIndex={initialIndex} restore={restore} />);
  });
}

// A no-op re-render stands in for an RSC commit: the no-dep restore effect
// runs after it.
function commit(initialIndex: number, restore: boolean) {
  act(() => {
    root.render(<Harness initialIndex={initialIndex} restore={restore} />);
  });
}

function radios(): HTMLButtonElement[] {
  return Array.from(
    container.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
  );
}

function pressArrowRight() {
  const group = container.querySelector('[role="radiogroup"]');
  act(() => {
    group?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
  });
}

function dropToBody() {
  act(() => {
    document.body.focus();
  });
  expect(document.activeElement).toBe(document.body);
}

describe("useRovingTablist — restoreFocusOnCommit (automatic)", () => {
  it("(a) keeps the flag and does not hijack while the synchronous arrow focus still holds the target", () => {
    render(0, true);
    pressArrowRight();
    // Synchronous arrow focus landed on the next radio (selectedIndex → 1).
    expect(document.activeElement).toBe(radios()[1]);

    // A commit while focus is still on the target: the restore pass sees
    // activeElement === target and returns, keeping the flag and not stealing.
    commit(0, true);
    expect(document.activeElement).toBe(radios()[1]);

    // Flag was kept: a subsequent body-drop + commit still restores.
    dropToBody();
    commit(0, true);
    expect(document.activeElement).toBe(radios()[1]);
  });

  it("(b) restores focus to the selected radio when a commit drops it to <body>, then clears the flag", () => {
    render(0, true);
    pressArrowRight();
    expect(document.activeElement).toBe(radios()[1]);

    // The data-driven re-render drops focus to <body>; the post-commit pass
    // restores it to the selected radio.
    dropToBody();
    commit(0, true);
    expect(document.activeElement).toBe(radios()[1]);

    // Flag cleared: a second unrelated body-drop + commit must NOT re-restore
    // (guards against a permanent flag).
    dropToBody();
    commit(0, true);
    expect(document.activeElement).toBe(document.body);
  });

  it("(c) does not restore when the user moved focus elsewhere, and clears the flag", () => {
    render(0, true);
    pressArrowRight();
    expect(document.activeElement).toBe(radios()[1]);

    // User deliberately moved focus to another element before the commit.
    act(() => {
      outside.focus();
    });
    expect(document.activeElement).toBe(outside);
    commit(0, true);
    // Focus is not hijacked back into the group.
    expect(document.activeElement).toBe(outside);

    // Flag was cleared (without restoring): a later body-drop + commit no-ops.
    dropToBody();
    commit(0, true);
    expect(document.activeElement).toBe(document.body);
  });

  it("(AC-4) does not restore when the consumer did not opt in", () => {
    render(0, false);
    pressArrowRight();
    expect(document.activeElement).toBe(radios()[1]);

    // Without opt-in the restore pass early-returns, so a body-drop + commit
    // leaves focus on <body> (no hijack).
    dropToBody();
    commit(0, false);
    expect(document.activeElement).toBe(document.body);
  });
});
