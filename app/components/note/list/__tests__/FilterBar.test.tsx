// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issue #478: the tag/visibility/etc. selection must reflect the moment a
 * control is clicked, held by `useOptimistic` for the whole loader
 * round-trip. The fix awaits `router.navigate` inside the transition so it
 * stays pending until fresh props commit; without the await the transition
 * ends synchronously and the optimistic value snaps back to baseline before
 * the click is ever shown.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const routerNavigate = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: routerNavigate }),
}));

vi.mock("../NotePickerDialog", () => ({ NotePickerDialog: () => null }));

const { FilterBar } = await import("../FilterBar");

type Tag = { id: string; name: string; noteCount: number };

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  routerNavigate.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

async function flush() {
  // Settling a transition after a caught navigation rejection takes several
  // microtask hops (reject → catch → resolve → React commits the revert), so
  // drain a generous number of ticks.
  await act(async () => {
    for (let i = 0; i < 30; i++) await Promise.resolve();
  });
}

function renderBar(tags: readonly Tag[], selectedTagNames: readonly string[]) {
  act(() => {
    root.render(
      <FilterBar
        tags={tags}
        selectedTagNames={selectedTagNames}
        from={undefined}
        to={undefined}
        visibility={undefined}
        directoryId={undefined}
        referencingNoteId={undefined}
      />,
    );
  });
}

function tagButton(name: string): HTMLButtonElement {
  const btns = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  );
  const found = btns.find((b) => (b.textContent ?? "").includes(`#${name}`));
  if (!found) throw new Error(`tag chip "${name}" not found`);
  return found;
}

describe("FilterBar — optimistic selection (Issue #478)", () => {
  it("reflects the tag selection immediately while navigation is pending", async () => {
    // Hold the navigation open so the transition stays pending; the
    // optimistic selection must be visible before it settles.
    let resolveNav: (() => void) | undefined;
    routerNavigate.mockReturnValue(
      new Promise<void>((res) => {
        resolveNav = () => res();
      }),
    );

    renderBar([{ id: "t1", name: "alpha", noteCount: 3 }], []);

    const chip = tagButton("alpha");
    expect(chip.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      chip.click();
    });
    await flush();

    expect(routerNavigate).toHaveBeenCalledTimes(1);
    expect(tagButton("alpha").getAttribute("aria-pressed")).toBe("true");
    expect(tagButton("alpha").getAttribute("data-active")).toBe("true");

    // Settle the navigation so the pending transition does not leak into the
    // next test (a never-resolving transition keeps React's scheduler busy).
    await act(async () => {
      resolveNav?.();
    });
    await flush();
  });

  it("rolls back to the baseline when navigation rejects", async () => {
    let rejectNav: ((e: unknown) => void) | undefined;
    routerNavigate.mockReturnValue(
      new Promise<void>((_res, rej) => {
        rejectNav = rej;
      }),
    );

    renderBar([{ id: "t1", name: "alpha", noteCount: 3 }], []);

    await act(async () => {
      tagButton("alpha").click();
    });
    await flush();

    // Optimistic selection shown while the navigation is in flight.
    expect(tagButton("alpha").getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      rejectNav?.(new Error("navigation failed"));
    });
    await flush();

    // Transition settles, props never changed (no real loader), so the
    // selection snaps back to the server-confirmed baseline.
    expect(tagButton("alpha").getAttribute("aria-pressed")).toBe("false");
    expect(tagButton("alpha").getAttribute("data-active")).toBeNull();
  });
});
