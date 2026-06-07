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
      'div[role="tablist"] button',
    ),
  );
}

function getOrderToggleButton(): HTMLButtonElement {
  const btns = Array.from(
    ctx.container.querySelectorAll<HTMLButtonElement>("button"),
  );
  // The order toggle button has aria-pressed attribute
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

    // The search function should set q to the trimmed value
    if (typeof call?.search === "function") {
      const result = call.search({});
      expect(result.q).toBe("test query");
    }
  });

  it("removes q from URL when submitting empty search (T-W-001)", async () => {
    // Key test case for T-W-001: empty submit must drop `q` from URL
    await renderToolbar("old-search");

    const form = getSearchForm();
    const input = getSearchInput();

    // Clear the input
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

    // The search function should remove q entirely when empty
    if (typeof call?.search === "function") {
      const prev = { q: "old-search", sort: "name" };
      const result = call.search(prev);
      // q should not be in the result when empty submit
      expect(result).not.toHaveProperty("q");
      // Other params should be preserved
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
      // Simulate prev state with sort and order
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
    expect(noteCountBtn?.getAttribute("aria-selected")).toBe("true");
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

  it("disables sort buttons while navigation is pending", async () => {
    // Mock navigate to not resolve immediately
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
    // Don't flush yet — let the pending state settle
    await act(async () => {
      await Promise.resolve();
    });

    // Button should now be disabled (pending)
    expect(noteCountBtn?.disabled).toBe(true);

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

  it("disables order toggle while navigation is pending", async () => {
    let resolveNav: (() => void) | undefined;
    routerNavigate.mockImplementation(
      () =>
        new Promise<void>((res) => {
          resolveNav = res;
        }),
    );

    await renderToolbar();
    const toggleBtn = getOrderToggleButton();

    expect(toggleBtn.disabled).toBe(false);

    await act(async () => {
      toggleBtn.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(toggleBtn.disabled).toBe(true);

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
