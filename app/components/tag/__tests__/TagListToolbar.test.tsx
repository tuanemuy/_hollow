// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const routerNavigate = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    navigate: routerNavigate,
  }),
}));

type Container = {
  container: HTMLDivElement;
  root: Root;
};

let ctx: Container;

beforeEach(() => {
  routerNavigate.mockClear();
  ctx = {
    container: document.createElement("div"),
    root: null as unknown as Root,
  };
  document.body.appendChild(ctx.container);
  ctx.root = createRoot(ctx.container);
});

afterEach(() => {
  act(() => {
    ctx.root.unmount();
  });
  ctx.container.remove();
});

async function renderToolbar(
  query?: string,
  sort: "name" | "noteCount" | "createdAt" | "lastUsedAt" = "name",
  order: "asc" | "desc" = "asc",
) {
  const { TagListToolbar } = await import("../TagListToolbar");
  act(() => {
    ctx.root.render(<TagListToolbar query={query} sort={sort} order={order} />);
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function getSearchInput(): HTMLInputElement {
  const input =
    ctx.container.querySelector<HTMLInputElement>('input[name="q"]');
  if (!input) throw new Error("search input not found");
  return input;
}

function getSearchForm(): HTMLFormElement {
  const form = ctx.container.querySelector<HTMLFormElement>("form");
  if (!form) throw new Error("search form not found");
  return form;
}

function getSortButtons(): HTMLButtonElement[] {
  return Array.from(
    ctx.container.querySelectorAll<HTMLButtonElement>(
      'div[role="radiogroup"] button',
    ),
  );
}

async function pressSortKey(key: string): Promise<void> {
  const group = ctx.container.querySelector('[role="radiogroup"]');
  await act(async () => {
    group?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
  await flush();
}

function getOrderToggleButton(): HTMLButtonElement {
  const btns = Array.from(
    ctx.container.querySelectorAll<HTMLButtonElement>("button"),
  );
  const toggle = btns.find((b) => b.hasAttribute("aria-pressed"));
  if (!toggle) throw new Error("order toggle button not found");
  return toggle;
}

describe("TagListToolbar — search input", () => {
  it("renders search input with current query as default value", async () => {
    await renderToolbar("research");
    const input = getSearchInput();
    expect(input.value).toBe("research");
  });

  it("renders search input empty when query is undefined", async () => {
    await renderToolbar(undefined);
    const input = getSearchInput();
    expect(input.value).toBe("");
  });

  it("submits form with trimmed search query", async () => {
    await renderToolbar();

    const form = getSearchForm();
    const input = getSearchInput();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "  test query  ");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true }));
    });
    await flush();

    expect(routerNavigate).toHaveBeenCalledTimes(1);
    const call = routerNavigate.mock.calls[0]?.[0];
    expect(call?.to).toBe("/tags");

    if (typeof call?.search === "function") {
      const result = call.search({});
      expect(result.q).toBe("test query");
    }
  });

  it("removes q from URL when submitting empty search", async () => {
    await renderToolbar("old-search");

    const form = getSearchForm();
    const input = getSearchInput();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true }));
    });
    await flush();

    expect(routerNavigate).toHaveBeenCalledTimes(1);
    const call = routerNavigate.mock.calls[0]?.[0];
    expect(call?.to).toBe("/tags");

    // Empty submit must drop `q` entirely while preserving other params.
    if (typeof call?.search === "function") {
      const prev = { q: "old-search", sort: "name" };
      const result = call.search(prev);
      expect(result).not.toHaveProperty("q");
      expect(result.sort).toBe("name");
    }
  });

  it("preserves other search params when submitting new query", async () => {
    await renderToolbar(undefined, "noteCount", "desc");

    const form = getSearchForm();
    const input = getSearchInput();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(input, "new-tag");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true }));
    });
    await flush();

    expect(routerNavigate).toHaveBeenCalledTimes(1);
    const call = routerNavigate.mock.calls[0]?.[0];

    if (typeof call?.search === "function") {
      const prev = { sort: "noteCount", order: "desc" };
      const result = call.search(prev);
      expect(result.q).toBe("new-tag");
      expect(result.sort).toBe("noteCount");
      expect(result.order).toBe("desc");
    }
  });
});

describe("TagListToolbar — sort controls", () => {
  it("renders sort buttons with correct labels", async () => {
    await renderToolbar();
    const buttons = getSortButtons();
    expect(buttons.length).toBe(4);
    const labels = buttons.map((b) => b.textContent?.trim());
    expect(labels).toContain("名前");
    expect(labels).toContain("ノート数");
    expect(labels).toContain("作成日時");
    expect(labels).toContain("最終使用");
  });

  it("marks current sort button as active", async () => {
    await renderToolbar(undefined, "noteCount");
    const buttons = getSortButtons();
    const noteCountBtn = buttons.find((b) =>
      (b.textContent ?? "").includes("ノート数"),
    );
    // data-active is set to true when active (React renders boolean attributes)
    expect(noteCountBtn?.getAttribute("data-active")).toBe("true");
    expect(noteCountBtn?.getAttribute("aria-checked")).toBe("true");
  });

  // #776: the sort axis is an APG Radio Group, mirroring the #660 display-mode
  // segmented control. No tablist/tab/aria-selected may remain.
  it("exposes the APG Radio Group contract (radiogroup / radio / aria-checked, no tablist)", async () => {
    await renderToolbar(undefined, "name");
    const group = ctx.container.querySelector('[role="radiogroup"]');
    expect(group).not.toBeNull();
    expect(group?.getAttribute("aria-label")).toBe("並び替え軸");
    expect(group?.getAttribute("aria-orientation")).toBe("horizontal");
    // The old (incomplete) Tabs contract is fully gone.
    expect(ctx.container.querySelector('[role="tablist"]')).toBeNull();
    expect(ctx.container.querySelector('[role="tab"]')).toBeNull();
    expect(ctx.container.querySelector("[aria-selected]")).toBeNull();

    const radios = getSortButtons();
    expect(radios.map((b) => b.getAttribute("role"))).toEqual([
      "radio",
      "radio",
      "radio",
      "radio",
    ]);
    expect(radios.map((b) => b.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false",
      "false",
    ]);
    // Roving tabindex: only the checked radio is tabbable (#660 / #776 AC-2).
    expect(radios.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  // #776: automatic activation — Arrow / Home / End move focus AND select
  // (navigate), wrapping at both ends. The select logic is the same `run`
  // the click path uses, so the navigate contract is unchanged.
  it("ArrowRight moves selection to the next sort and navigates", async () => {
    await renderToolbar(undefined, "name");
    await pressSortKey("ArrowRight");

    expect(routerNavigate).toHaveBeenCalledTimes(1);
    const call = routerNavigate.mock.calls[0]?.[0];
    if (typeof call?.search === "function") {
      expect(call.search({ sort: "name" }).sort).toBe("noteCount");
    }
    // Roving focus follows the move to the next radio.
    expect(document.activeElement).toBe(getSortButtons()[1]);
  });

  it("ArrowLeft from the first sort wraps to the last and navigates", async () => {
    await renderToolbar(undefined, "name");
    await pressSortKey("ArrowLeft");

    expect(routerNavigate).toHaveBeenCalledTimes(1);
    const call = routerNavigate.mock.calls[0]?.[0];
    if (typeof call?.search === "function") {
      expect(call.search({ sort: "name" }).sort).toBe("lastUsedAt");
    }
    expect(document.activeElement).toBe(getSortButtons()[3]);
  });

  it("ArrowDown behaves like ArrowRight: moves selection and navigates", async () => {
    await renderToolbar(undefined, "name");
    await pressSortKey("ArrowDown");

    expect(routerNavigate).toHaveBeenCalledTimes(1);
    const call = routerNavigate.mock.calls[0]?.[0];
    if (typeof call?.search === "function") {
      expect(call.search({ sort: "name" }).sort).toBe("noteCount");
    }
    expect(document.activeElement).toBe(getSortButtons()[1]);
  });

  it("ArrowUp from the first sort wraps to the last and navigates", async () => {
    await renderToolbar(undefined, "name");
    await pressSortKey("ArrowUp");

    expect(routerNavigate).toHaveBeenCalledTimes(1);
    const call = routerNavigate.mock.calls[0]?.[0];
    if (typeof call?.search === "function") {
      expect(call.search({ sort: "name" }).sort).toBe("lastUsedAt");
    }
    expect(document.activeElement).toBe(getSortButtons()[3]);
  });

  it("Home jumps to the first sort and End to the last", async () => {
    await renderToolbar(undefined, "createdAt");

    await pressSortKey("End");
    expect(routerNavigate).toHaveBeenCalledTimes(1);
    let call = routerNavigate.mock.calls[0]?.[0];
    if (typeof call?.search === "function") {
      expect(call.search({ sort: "createdAt" }).sort).toBe("lastUsedAt");
    }

    await pressSortKey("Home");
    expect(routerNavigate).toHaveBeenCalledTimes(2);
    call = routerNavigate.mock.calls[1]?.[0];
    if (typeof call?.search === "function") {
      expect(call.search({ sort: "createdAt" }).sort).toBe("name");
    }
  });

  it("consecutive arrow presses navigate for each press", async () => {
    // RadioGroup automatic activation: every arrow press independently
    // navigates. The component reads `current` from the (mocked) URL value,
    // which does not change between presses here, so each ArrowRight steps
    // from `name` → next index relative to the same baseline. This pins that
    // every keypress drives its own navigate (no swallowing / debounce).
    await renderToolbar(undefined, "name");

    await pressSortKey("ArrowRight");
    await pressSortKey("ArrowRight");

    expect(routerNavigate).toHaveBeenCalledTimes(2);
    // First press: name → noteCount
    const firstCall = routerNavigate.mock.calls[0]?.[0];
    if (typeof firstCall?.search === "function") {
      expect(firstCall.search({ sort: "name" }).sort).toBe("noteCount");
    }
    // Second press (still from baseline name): name → noteCount (same result,
    // but independent navigate call confirms no debounce).
    const secondCall = routerNavigate.mock.calls[1]?.[0];
    if (typeof secondCall?.search === "function") {
      expect(secondCall.search({ sort: "name" }).sort).toBe("noteCount");
    }
  });

  it("does not preventDefault on unhandled keys, leaving Tab to move focus away", async () => {
    await renderToolbar(undefined, "name");
    const group = ctx.container.querySelector('[role="radiogroup"]');
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true });
    await act(async () => {
      group?.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(routerNavigate).not.toHaveBeenCalled();
  });

  it("navigates to new sort when clicking a sort button", async () => {
    await renderToolbar(undefined, "name");
    const buttons = getSortButtons();
    const createdAtBtn = buttons.find((b) =>
      (b.textContent ?? "").includes("作成日時"),
    );

    await act(async () => {
      createdAtBtn?.click();
    });
    await flush();

    expect(routerNavigate).toHaveBeenCalledTimes(1);
    const call = routerNavigate.mock.calls[0]?.[0];

    if (typeof call?.search === "function") {
      const prev = { sort: "name" };
      const result = call.search(prev);
      expect(result.sort).toBe("createdAt");
    }
  });

  it("supports lastUsedAt sort button (Issue #569)", async () => {
    await renderToolbar(undefined, "name");
    const buttons = getSortButtons();
    const lastUsedBtn = buttons.find((b) =>
      (b.textContent ?? "").includes("最終使用"),
    );
    expect(lastUsedBtn).toBeDefined();

    await act(async () => {
      lastUsedBtn?.click();
    });
    await flush();

    expect(routerNavigate).toHaveBeenCalledTimes(1);
    const call = routerNavigate.mock.calls[0]?.[0];

    if (typeof call?.search === "function") {
      const prev = { sort: "name" };
      const result = call.search(prev);
      expect(result.sort).toBe("lastUsedAt");
    }
  });

  it("keeps sort buttons enabled and marks the toolbar busy while navigation is pending", async () => {
    // Mock navigate to not resolve immediately so the transition stays pending.
    let resolveNav: (() => void) | undefined;
    routerNavigate.mockImplementation(
      () =>
        new Promise<void>((res) => {
          resolveNav = res;
        }),
    );

    await renderToolbar();
    const buttons = getSortButtons();
    const noteCountBtn = buttons.find((b) =>
      (b.textContent ?? "").includes("ノート数"),
    );

    expect(noteCountBtn?.disabled).toBe(false);

    await act(async () => {
      noteCountBtn?.click();
    });
    // Don't flush yet — let the pending state settle.
    await act(async () => {
      await Promise.resolve();
    });

    // FilterBar pattern: controls stay enabled so rapid toggles are not
    // dropped; the toolbar exposes the in-flight state via aria-busy instead.
    expect(noteCountBtn?.disabled).toBe(false);
    const toolbar = ctx.container.querySelector('[aria-busy="true"]');
    expect(toolbar).not.toBeNull();
    // The optimistic selection is reflected immediately, before the loader
    // round-trip commits.
    expect(noteCountBtn?.getAttribute("data-active")).toBe("true");
    expect(noteCountBtn?.getAttribute("aria-checked")).toBe("true");

    await act(async () => {
      resolveNav?.();
    });
    await flush();
  });
});

describe("TagListToolbar — order toggle", () => {
  it("renders order toggle button", async () => {
    await renderToolbar();
    const toggleBtn = getOrderToggleButton();
    expect(toggleBtn).toBeDefined();
  });

  it("reflects current order in toggle button aria-pressed", async () => {
    await renderToolbar(undefined, "name", "asc");
    let toggleBtn = getOrderToggleButton();
    expect(toggleBtn.getAttribute("aria-pressed")).toBe("false");

    await act(async () => {
      ctx.root.unmount();
    });
    ctx.root = createRoot(ctx.container);
    await renderToolbar(undefined, "name", "desc");

    toggleBtn = getOrderToggleButton();
    expect(toggleBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("toggles order from asc to desc when clicked", async () => {
    await renderToolbar(undefined, "name", "asc");
    const toggleBtn = getOrderToggleButton();

    await act(async () => {
      toggleBtn.click();
    });
    await flush();

    expect(routerNavigate).toHaveBeenCalledTimes(1);
    const call = routerNavigate.mock.calls[0]?.[0];

    if (typeof call?.search === "function") {
      const prev = { order: "asc" };
      const result = call.search(prev);
      expect(result.order).toBe("desc");
    }
  });

  it("toggles order from desc to asc when clicked", async () => {
    await renderToolbar(undefined, "name", "desc");
    const toggleBtn = getOrderToggleButton();

    await act(async () => {
      toggleBtn.click();
    });
    await flush();

    expect(routerNavigate).toHaveBeenCalledTimes(1);
    const call = routerNavigate.mock.calls[0]?.[0];

    if (typeof call?.search === "function") {
      const prev = { order: "desc" };
      const result = call.search(prev);
      expect(result.order).toBe("asc");
    }
  });

  it("keeps the order toggle enabled and marks the toolbar busy while navigation is pending", async () => {
    let resolveNav: (() => void) | undefined;
    routerNavigate.mockImplementation(
      () =>
        new Promise<void>((res) => {
          resolveNav = res;
        }),
    );

    await renderToolbar(undefined, "name", "asc");
    const toggleBtn = getOrderToggleButton();

    expect(toggleBtn.disabled).toBe(false);

    await act(async () => {
      toggleBtn.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Stays enabled (FilterBar pattern); toolbar is aria-busy and the optimistic
    // order flip is reflected immediately (aria-pressed → true for desc).
    expect(toggleBtn.disabled).toBe(false);
    const toolbar = ctx.container.querySelector('[aria-busy="true"]');
    expect(toolbar).not.toBeNull();
    expect(toggleBtn.getAttribute("aria-pressed")).toBe("true");

    await act(async () => {
      resolveNav?.();
    });
    await flush();
  });
});

describe("TagListToolbar — integration", () => {
  it("merges sort + search in a single navigate call", async () => {
    await renderToolbar("alpha", "name", "asc");
    const buttons = getSortButtons();
    const noteCountBtn = buttons.find((b) =>
      (b.textContent ?? "").includes("ノート数"),
    );

    await act(async () => {
      noteCountBtn?.click();
    });
    await flush();

    expect(routerNavigate).toHaveBeenCalledTimes(1);
    const call = routerNavigate.mock.calls[0]?.[0];

    if (typeof call?.search === "function") {
      const prev = { q: "alpha", sort: "name", order: "asc" };
      const result = call.search(prev);
      expect(result.q).toBe("alpha");
      expect(result.sort).toBe("noteCount");
      expect(result.order).toBe("asc");
    }
  });

  it("preserves search query when toggling order", async () => {
    await renderToolbar("research", "noteCount", "asc");
    const toggleBtn = getOrderToggleButton();

    await act(async () => {
      toggleBtn.click();
    });
    await flush();

    expect(routerNavigate).toHaveBeenCalledTimes(1);
    const call = routerNavigate.mock.calls[0]?.[0];

    if (typeof call?.search === "function") {
      const prev = { q: "research", sort: "noteCount", order: "asc" };
      const result = call.search(prev);
      expect(result.q).toBe("research");
      expect(result.sort).toBe("noteCount");
      expect(result.order).toBe("desc");
    }
  });
});
