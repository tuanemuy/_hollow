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
const { popoverSheetPanel } = await import("@/components/common/styles");

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
  // Scope to `[aria-pressed]` so this never matches the picker's
  // `role="option"` buttons (which also contain `#name`) when the listbox is
  // open — without it the result silently depends on DOM order.
  const btns = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button[aria-pressed]"),
  );
  const found = btns.find((b) => (b.textContent ?? "").includes(`#${name}`));
  if (!found) throw new Error(`tag chip "${name}" not found`);
  return found;
}

type BarProps = {
  visibility?: "private" | "unlisted" | "public" | undefined;
  from?: string | undefined;
  to?: string | undefined;
};

function renderBarWith({ visibility, from, to }: BarProps = {}) {
  act(() => {
    root.render(
      <FilterBar
        tags={[]}
        selectedTagNames={[]}
        from={from}
        to={to}
        visibility={visibility}
        directoryId={undefined}
        referencingNoteId={undefined}
      />,
    );
  });
}

function buttonByText(text: string): HTMLButtonElement {
  const btns = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  );
  const found = btns.find((b) => (b.textContent ?? "").trim().startsWith(text));
  if (!found) throw new Error(`button "${text}" not found`);
  return found;
}

function radioItems(): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[role="menuitemradio"]'),
  );
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

/**
 * Issue #467: the existing #478 cases above only cover tag chips, not the
 * Date/Visibility popovers. These lock the popover migration onto the shared
 * `<Popover>` + `useRovingMenu` primitives.
 */
describe("FilterBar — VisibilityPopover (Issue #467)", () => {
  it("opens as a role=menu with menuitemradio options and aria-checked reflecting the value", () => {
    routerNavigate.mockResolvedValue(undefined);
    renderBarWith({ visibility: "public" });

    expect(radioItems()).toHaveLength(0);
    act(() => {
      buttonByText("公開状態").click();
    });

    const items = radioItems();
    expect(items.length).toBeGreaterThan(0);
    // The selected option (public) is checked and lands roving focus.
    const checked = items.filter(
      (el) => el.getAttribute("aria-checked") === "true",
    );
    expect(checked).toHaveLength(1);
    expect(checked[0].textContent).toContain("公開");
    expect(checked[0].getAttribute("tabindex")).toBe("0");
    expect(document.activeElement).toBe(checked[0]);
  });

  it("selects an option, navigates, and closes the popover", async () => {
    routerNavigate.mockResolvedValue(undefined);
    renderBarWith({ visibility: undefined });
    act(() => {
      buttonByText("公開状態").click();
    });
    const items = radioItems();
    // Pick a non-"all" option (private is index 1).
    await act(async () => {
      (items[1] as HTMLButtonElement).click();
    });
    await flush();
    expect(routerNavigate).toHaveBeenCalledTimes(1);
    // Selecting closes the menu.
    expect(radioItems()).toHaveLength(0);
  });
});

describe("FilterBar — DatePopover (Issue #467)", () => {
  function datePanel(): HTMLElement | null {
    return container.querySelector<HTMLElement>('[role="dialog"]');
  }

  it("opens as a role=dialog and closes on Escape", () => {
    routerNavigate.mockResolvedValue(undefined);
    renderBarWith();
    expect(datePanel()).toBeNull();
    act(() => {
      buttonByText("期間").click();
    });
    const panel = datePanel();
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("aria-label")).toBe("期間フィルタ");
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(datePanel()).toBeNull();
  });

  it("closes via the 閉じる button", () => {
    routerNavigate.mockResolvedValue(undefined);
    renderBarWith();
    act(() => {
      buttonByText("期間").click();
    });
    expect(datePanel()).not.toBeNull();
    act(() => {
      buttonByText("閉じる").click();
    });
    expect(datePanel()).toBeNull();
  });

  it("clears the date range from an applied chip via the 解除 button", async () => {
    routerNavigate.mockResolvedValue(undefined);
    // Applied state: from/to set so the chip (applied=true) renders the
    // "期間フィルタを解除" remove button.
    renderBarWith({ from: "2026-01-01", to: "2026-01-31" });
    const clearBtn = container.querySelector<HTMLButtonElement>(
      'button[aria-label="期間フィルタを解除"]',
    );
    expect(clearBtn).not.toBeNull();
    await act(async () => {
      clearBtn?.click();
    });
    await flush();
    expect(routerNavigate).toHaveBeenCalledTimes(1);
  });
});

describe("FilterBar すべてクリア × (Issue #649 / #626 ADR-006)", () => {
  const clearX = () =>
    container.querySelector<HTMLButtonElement>(
      'button[aria-label="フィルタをすべてクリア"]',
    );

  it("is hidden when no filter is applied", () => {
    routerNavigate.mockResolvedValue(undefined);
    renderBarWith();
    expect(clearX()).toBeNull();
  });

  it("renders as an icon-only circular × with title when a filter is applied, and clears on click", async () => {
    routerNavigate.mockResolvedValue(undefined);
    renderBarWith({ from: "2026-01-01", to: "2026-01-31" });
    const btn = clearX();
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("title")).toBe("フィルタをすべてクリア");
    expect(btn?.textContent).toBe("");
    expect(btn?.querySelector("svg")).not.toBeNull();
    await act(async () => {
      btn?.click();
    });
    await flush();
    expect(routerNavigate).toHaveBeenCalledTimes(1);
  });
});

describe("FilterBar — + タグ TagPicker", () => {
  const TAGS: readonly Tag[] = [
    { id: "t1", name: "alpha", noteCount: 3 },
    { id: "t2", name: "beta", noteCount: 1 },
    { id: "t3", name: "gamma", noteCount: 7 },
  ];

  const pickerTrigger = () =>
    container.querySelector<HTMLButtonElement>(
      'button[aria-label="タグで絞り込み"]',
    );

  const listbox = () =>
    container.querySelector<HTMLElement>('[role="listbox"]');

  const options = () =>
    Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    );

  function openPicker() {
    act(() => {
      pickerTrigger()?.click();
    });
  }

  it("renders the ghost chip after the tag chips and before the 期間 chip, with the listbox a11y contract", () => {
    routerNavigate.mockResolvedValue(undefined);
    renderBar(TAGS, []);
    const trigger = pickerTrigger();
    expect(trigger).not.toBeNull();
    expect(trigger?.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger?.getAttribute("title")).toBe("タグで絞り込み");
    expect(trigger?.querySelector("svg")).not.toBeNull();
    expect(trigger?.textContent).toContain("タグ");

    const lastTagChip = tagButton("gamma");
    const dateChip = buttonByText("期間");
    expect(
      lastTagChip.compareDocumentPosition(trigger as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      (trigger as Node).compareDocumentPosition(dateChip) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("is not rendered when there are no tags", () => {
    routerNavigate.mockResolvedValue(undefined);
    renderBar([], []);
    expect(pickerTrigger()).toBeNull();
  });

  it("opens a multiselectable listbox with every tag as an option reflecting selection", () => {
    routerNavigate.mockResolvedValue(undefined);
    renderBar(TAGS, ["beta"]);
    expect(listbox()).toBeNull();
    openPicker();
    const panel = listbox();
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("aria-multiselectable")).toBe("true");
    const opts = options();
    expect(opts).toHaveLength(TAGS.length);
    expect(opts.map((o) => o.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(opts[1].textContent).toContain("#beta");
    // APG Listbox: roving focus lands on the first selected option when the
    // picker opens (matching VisibilityPopover's landing behaviour).
    expect(opts[1].getAttribute("tabindex")).toBe("0");
    expect(document.activeElement).toBe(opts[1]);
  });

  it("keeps the panel built on the shared sheet panel styles (mobile bottom sheet basis)", () => {
    routerNavigate.mockResolvedValue(undefined);
    renderBar(TAGS, []);
    openPicker();
    const cls = listbox()?.className ?? "";
    expect(cls).toContain(popoverSheetPanel);
    // Containing the shared constant is not enough on its own (the constant
    // itself once lacked the sheet utilities), so pin the
    // utilities that actually detach the panel from the chip-sized trigger
    // wrapper and anchor it to the viewport bottom below `sm`.
    for (const utility of [
      "max-sm:fixed",
      "max-sm:bottom-0",
      "max-sm:top-auto",
      "max-sm:left-0",
      "max-sm:right-0",
    ]) {
      expect(cls).toContain(utility);
    }
  });

  it("toggles a tag optimistically on option click and keeps the panel open", async () => {
    let resolveNav: (() => void) | undefined;
    routerNavigate.mockReturnValue(
      new Promise<void>((res) => {
        resolveNav = () => res();
      }),
    );
    renderBar(TAGS, []);
    openPicker();
    await act(async () => {
      options()[0].click();
    });
    await flush();
    expect(routerNavigate).toHaveBeenCalledTimes(1);
    // Optimistic selection is mirrored on the option and the inline chip
    // while the navigation is pending; multi-select keeps the panel open.
    expect(options()[0].getAttribute("aria-selected")).toBe("true");
    expect(tagButton("alpha").getAttribute("aria-pressed")).toBe("true");
    expect(listbox()).not.toBeNull();
    await act(async () => {
      resolveNav?.();
    });
    await flush();
    // The focus-loss regression surfaced AFTER the navigation settled (the
    // RSC re-render's focus loss closed the panel), so the open state must also
    // hold once the promise resolves, not just while pending. (The optimistic
    // selection itself reverts to the baseline here because no real loader
    // ever delivers updated props in this harness.)
    expect(listbox()).not.toBeNull();
  });

  it("deselects an already-selected tag optimistically and keeps the panel open", async () => {
    let resolveNav: (() => void) | undefined;
    routerNavigate.mockReturnValue(
      new Promise<void>((res) => {
        resolveNav = () => res();
      }),
    );
    renderBar(TAGS, ["beta"]);
    openPicker();
    expect(options()[1].getAttribute("aria-selected")).toBe("true");
    await act(async () => {
      options()[1].click();
    });
    await flush();
    expect(routerNavigate).toHaveBeenCalledTimes(1);
    // The deselect path runs a different array operation (filter, not
    // concat), so it is pinned independently of the select-direction case.
    expect(options()[1].getAttribute("aria-selected")).toBe("false");
    expect(tagButton("beta").getAttribute("aria-pressed")).toBe("false");
    expect(listbox()).not.toBeNull();
    await act(async () => {
      resolveNav?.();
    });
    await flush();
    expect(listbox()).not.toBeNull();
  });

  it("syncs roving focus to the clicked option so ArrowDown moves to its successor", async () => {
    routerNavigate.mockResolvedValue(undefined);
    renderBar(TAGS, []);
    openPicker();
    const opts = options();
    await act(async () => {
      opts[1].click();
    });
    await flush();
    expect(document.activeElement).toBe(options()[1]);
    act(() => {
      options()[1].dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.activeElement).toBe(options()[2]);
  });

  it("restores focus to the active option when a commit drops focus to <body>", async () => {
    routerNavigate.mockResolvedValue(undefined);
    renderBar(TAGS, []);
    openPicker();
    await act(async () => {
      options()[1].click();
    });
    await flush();
    expect(document.activeElement).toBe(options()[1]);
    // The RSC re-render after the filter navigation drops focus to <body>
    // mid-commit (the focused option node is swapped). Simulate that here as
    // blur-to-body followed by a re-render commit: the hook's after-commit
    // restore pass must pull focus back onto the active option, or every
    // subsequent ArrowDown is swallowed by <body>.
    act(() => {
      options()[1].blur();
    });
    expect(document.activeElement).toBe(document.body);
    renderBar(TAGS, ["beta"]);
    await flush();
    expect(document.activeElement).toBe(options()[1]);
    act(() => {
      options()[1].dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.activeElement).toBe(options()[2]);
  });

  it("clamps the restored focus index when the option set shrinks in the same commit", async () => {
    routerNavigate.mockResolvedValue(undefined);
    renderBar(TAGS, []);
    openPicker();
    await act(async () => {
      options()[2].click();
    });
    await flush();
    expect(document.activeElement).toBe(options()[2]);
    // A filter navigation can both drop focus to <body> and shrink the
    // option list in the same commit. The restore pass must clamp the stale
    // out-of-range index (2 → last remaining option) instead of no-opping,
    // or the arrow keys stay dead (same symptom as the focus-drop case above).
    act(() => {
      options()[2].blur();
    });
    expect(document.activeElement).toBe(document.body);
    renderBar(TAGS.slice(0, 2), []);
    await flush();
    expect(options()).toHaveLength(2);
    expect(document.activeElement).toBe(options()[1]);
    // The clamped index must also be synced into state so subsequent arrow
    // navigation continues from the clamped position.
    act(() => {
      options()[1].dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowUp",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.activeElement).toBe(options()[0]);
    act(() => {
      options()[0].dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "ArrowDown",
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    expect(document.activeElement).toBe(options()[1]);
  });

  it("closes on Escape and restores focus to the trigger", () => {
    routerNavigate.mockResolvedValue(undefined);
    renderBar(TAGS, []);
    openPicker();
    expect(listbox()).not.toBeNull();
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(listbox()).toBeNull();
    expect(document.activeElement).toBe(pickerTrigger());
  });

  it("closes the 期間 popover when the tag picker opens (mutual exclusion)", () => {
    routerNavigate.mockResolvedValue(undefined);
    renderBar(TAGS, []);
    act(() => {
      buttonByText("期間").click();
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    openPicker();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(listbox()).not.toBeNull();
  });
});
