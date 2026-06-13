// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FlatDirectory } from "../../loaders";
import { DirectoryTreeSelect } from "../DirectoryTreeSelect";

// The Rename/Delete dialogs reach for router + server-fn context that this
// DOM-only harness does not provide, and they are covered by their own suites.
// Stub them to a marker that renders only when `open`, so the close→open
// ordering (listbox gone, then dialog present) is observable here.
vi.mock("@/components/directory/RenameDirectoryDialog", () => ({
  RenameDirectoryDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="rename-dialog" /> : null,
}));
vi.mock("@/components/directory/DeleteDirectoryDialog", () => ({
  DeleteDirectoryDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="delete-dialog" /> : null,
}));

/**
 * Issue #689 (#712 review W-001): the single-pill directory selector wires
 * the pure `directoryTreeModel` into a combobox + listbox. The pure model is
 * unit-tested separately; these tests lock the *wiring* the model cannot
 * reach:
 *
 * 1. trigger label reflects selected path / pending name / unselected.
 * 2. pill click opens the Popover with a search input, listbox, and the
 *    trailing "新規ディレクトリを作成…" option.
 * 3. typing narrows the visible options (ancestor auto-expand surfaces deep
 *    matches).
 * 4. ArrowDown / ArrowUp move `aria-activedescendant` over the visible flat
 *    list; Enter selects the active option → `onSelectExisting` + close.
 * 5. clicking an option calls `onSelectExisting`.
 * 6. the create option → inline input → Enter → `onSetPendingName`.
 * 7. `aria-selected` tracks the arrow-active option (aria-activedescendant
 *    target) — matching the `DirectorySelectField` convention — while the
 *    committed directory (directoryId match) is expressed by `data-selected`.
 * 8. Escape closes; changing the query re-anchors activeIndex to the top;
 *    `disabled` keeps the trigger inert.
 * 9. Rename action closes the popover (listbox + aria-expanded=false) before
 *    the RenameDirectoryDialog opens (arch S-004, focus-capture avoidance).
 * 10. A zero-match query keeps only the create option and aria-activedescendant
 *     points at it (no dangling reference / crash).
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Forest:
//   research (0)
//   projects (0)
//     q2 (1)
//     hollow (1)
const tree: FlatDirectory[] = [
  {
    id: "research",
    parentId: null,
    name: "Research",
    depth: 0,
    path: "/Research",
  },
  {
    id: "projects",
    parentId: null,
    name: "Projects",
    depth: 0,
    path: "/Projects",
  },
  {
    id: "q2",
    parentId: "projects",
    name: "Q2 計画",
    depth: 1,
    path: "/Projects/Q2 計画",
  },
  {
    id: "hollow",
    parentId: "projects",
    name: "Hollow",
    depth: 1,
    path: "/Projects/Hollow",
  },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
});

type RenderProps = {
  directoryId?: string | null;
  pendingDirectoryName?: string | null;
  onSelectExisting?: (id: string | null) => void;
  onSetPendingName?: (name: string | null) => void;
  disabled?: boolean;
  allowExistingActions?: boolean;
};

function renderSelect(props: RenderProps = {}) {
  act(() => {
    root.render(
      <DirectoryTreeSelect
        tree={tree}
        directoryId={props.directoryId ?? null}
        pendingDirectoryName={props.pendingDirectoryName ?? null}
        onSelectExisting={props.onSelectExisting ?? (() => {})}
        onSetPendingName={props.onSetPendingName ?? (() => {})}
        {...(props.disabled !== undefined ? { disabled: props.disabled } : {})}
        {...(props.allowExistingActions !== undefined
          ? { allowExistingActions: props.allowExistingActions }
          : {})}
      />,
    );
  });
}

function trigger(): HTMLButtonElement {
  const btn = container.querySelector<HTMLButtonElement>(
    'button[aria-haspopup="dialog"]',
  );
  if (btn === null) throw new Error("pill trigger not rendered");
  return btn;
}

function openPanel() {
  act(() => {
    trigger().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  // The panel focuses the search input on a `setTimeout(0)`.
  act(() => {
    vi.runOnlyPendingTimers();
  });
}

function searchInput(): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>(
    'input[role="combobox"]',
  );
  if (input === null) throw new Error("search input not rendered");
  return input;
}

function typeQuery(value: string) {
  const input = searchInput();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function pressSearchKey(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    searchInput().dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
    );
  });
}

function options(): HTMLButtonElement[] {
  return Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('button[role="option"]'),
  );
}

describe("DirectoryTreeSelect trigger label", () => {
  it("shows the unselected label by default", () => {
    renderSelect();
    expect(trigger().textContent).toContain("ディレクトリを選択");
  });

  it("shows the selected directory path", () => {
    renderSelect({ directoryId: "hollow" });
    expect(trigger().textContent).toContain("/Projects/Hollow");
  });

  it("shows the pending new-directory name", () => {
    renderSelect({ pendingDirectoryName: "ideas" });
    expect(trigger().textContent).toContain("新規: ideas");
  });
});

describe("DirectoryTreeSelect open / search", () => {
  it("opens the popover with a search input, listbox, and create option", () => {
    renderSelect();
    openPanel();

    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(searchInput()).not.toBeNull();
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
    const create = options().find((o) =>
      (o.textContent ?? "").includes("新規ディレクトリを作成"),
    );
    expect(create).toBeDefined();
  });

  it("narrows options by query and auto-expands ancestors of a deep match", () => {
    renderSelect();
    openPanel();
    typeQuery("hollow");

    const labels = options()
      .filter((o) => o.getAttribute("role") === "option")
      .map((o) => (o.textContent ?? "").trim());
    // projects (ancestor) + hollow (match) + the create option.
    expect(labels.some((l) => l.includes("Projects"))).toBe(true);
    expect(labels.some((l) => l.includes("Hollow"))).toBe(true);
    expect(labels.some((l) => l.includes("Research"))).toBe(false);
  });
});

describe("DirectoryTreeSelect keyboard / selection", () => {
  it("moves aria-activedescendant with ArrowDown / ArrowUp", () => {
    renderSelect();
    openPanel();

    const first = searchInput().getAttribute("aria-activedescendant");
    expect(first).not.toBeNull();
    expect(options()[0]?.id).toBe(first);

    pressSearchKey("ArrowDown");
    const second = searchInput().getAttribute("aria-activedescendant");
    expect(second).toBe(options()[1]?.id);
    expect(second).not.toBe(first);

    pressSearchKey("ArrowUp");
    expect(searchInput().getAttribute("aria-activedescendant")).toBe(first);
  });

  it("selects the active option on Enter and closes", () => {
    const onSelectExisting = vi.fn();
    renderSelect({ onSelectExisting });
    openPanel();
    // First option is `research`.
    pressSearchKey("Enter");

    expect(onSelectExisting).toHaveBeenCalledTimes(1);
    expect(onSelectExisting).toHaveBeenCalledWith("research");
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
  });

  it("selects an option via click", () => {
    const onSelectExisting = vi.fn();
    renderSelect({ onSelectExisting });
    openPanel();
    const projects = options().find((o) =>
      (o.textContent ?? "").includes("Projects"),
    );
    act(() => {
      projects?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelectExisting).toHaveBeenCalledWith("projects");
  });

  it("does not select on Enter fired during IME composition", () => {
    const onSelectExisting = vi.fn();
    renderSelect({ onSelectExisting });
    openPanel();
    pressSearchKey("Enter", { isComposing: true });
    expect(onSelectExisting).not.toHaveBeenCalled();
  });
});

describe("DirectoryTreeSelect create flow", () => {
  it("opens the inline name input and commits via onSetPendingName", () => {
    const onSetPendingName = vi.fn();
    renderSelect({ onSetPendingName });
    openPanel();

    const create = options().find((o) =>
      (o.textContent ?? "").includes("新規ディレクトリを作成"),
    );
    act(() => {
      create?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      vi.runOnlyPendingTimers();
    });

    const nameInput = document.body.querySelector<HTMLInputElement>(
      'input[aria-label="新しいディレクトリ名"]',
    );
    expect(nameInput).not.toBeNull();

    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    act(() => {
      if (nameInput) {
        setter?.call(nameInput, "ideas");
        nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    act(() => {
      nameInput?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(onSetPendingName).toHaveBeenCalledTimes(1);
    expect(onSetPendingName).toHaveBeenCalledWith("ideas");
  });
});

describe("DirectoryTreeSelect aria-selected vs data-selected", () => {
  it("marks the committed directory data-selected and the arrow target aria-selected", () => {
    renderSelect({ directoryId: "projects" });
    openPanel();

    // Committed directory: data-selected present, but NOT arrow-active so it is
    // aria-selected=false (the active option owns aria-selected).
    const projects = options().find((o) =>
      (o.textContent ?? "").includes("Projects"),
    );
    expect(projects?.getAttribute("data-selected")).not.toBeNull();
    expect(projects?.getAttribute("aria-selected")).toBe("false");

    // The first option (research) is arrow-active by default: it carries both
    // data-active and aria-selected (the aria-activedescendant target), and is
    // NOT the committed directory.
    const active = options()[0];
    expect(active?.getAttribute("data-active")).not.toBeNull();
    expect(active?.getAttribute("aria-selected")).toBe("true");
    expect(active?.getAttribute("data-selected")).toBeNull();
    expect(active).not.toBe(projects);
    // The arrow-active option is the one aria-activedescendant points at.
    expect(searchInput().getAttribute("aria-activedescendant")).toBe(
      active?.id,
    );
  });

  it("keeps directory option buttons out of the Tab order (tabIndex=-1)", () => {
    renderSelect();
    openPanel();
    for (const option of options()) {
      expect(option.tabIndex).toBe(-1);
    }
  });
});

describe("DirectoryTreeSelect close / reset / disabled", () => {
  it("closes on Escape", () => {
    renderSelect();
    openPanel();
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
    act(() => {
      searchInput().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
  });

  it("re-anchors activeIndex to the first option when the query changes", () => {
    renderSelect();
    openPanel();

    // Move active off the first option.
    pressSearchKey("ArrowDown");
    expect(searchInput().getAttribute("aria-activedescendant")).toBe(
      options()[1]?.id,
    );

    // Changing the query resets the active option back to index 0.
    typeQuery("o");
    expect(searchInput().getAttribute("aria-activedescendant")).toBe(
      options()[0]?.id,
    );
  });

  it("does not open when disabled", () => {
    renderSelect({ disabled: true });
    expect(trigger().disabled).toBe(true);
    openPanel();
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
  });
});

describe("DirectoryTreeSelect rename / delete actions", () => {
  it("renders the actions only when allowExistingActions + a directory is selected", () => {
    renderSelect({ directoryId: "hollow", allowExistingActions: true });
    openPanel();
    const labels = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).map((b) => (b.textContent ?? "").trim());
    expect(labels).toContain("リネーム");
    expect(labels).toContain("削除");
  });

  it("does not render the actions without allowExistingActions", () => {
    renderSelect({ directoryId: "hollow" });
    openPanel();
    const labels = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).map((b) => (b.textContent ?? "").trim());
    expect(labels).not.toContain("リネーム");
  });

  it("closes the popover before opening the RenameDirectoryDialog", () => {
    renderSelect({ directoryId: "hollow", allowExistingActions: true });
    openPanel();

    // Pre-conditions: popover open, dialog not yet mounted.
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
    expect(
      document.body.querySelector('[data-testid="rename-dialog"]'),
    ).toBeNull();

    const renameBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim() === "リネーム");
    expect(renameBtn).toBeDefined();
    act(() => {
      renameBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    // close() ran first: the listbox is gone and the trigger collapsed,
    // then the dialog opened.
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(
      document.body.querySelector('[data-testid="rename-dialog"]'),
    ).not.toBeNull();
  });

  it("closes the popover before opening the DeleteDirectoryDialog", () => {
    renderSelect({ directoryId: "hollow", allowExistingActions: true });
    openPanel();

    const deleteBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => (b.textContent ?? "").trim() === "削除");
    expect(deleteBtn).toBeDefined();
    act(() => {
      deleteBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(
      document.body.querySelector('[data-testid="delete-dialog"]'),
    ).not.toBeNull();
  });
});

describe("DirectoryTreeSelect zero-match search gate", () => {
  it("keeps only the create option and points aria-activedescendant at it", () => {
    renderSelect();
    openPanel();
    // A query that matches no directory name leaves the create option only.
    typeQuery("zzzzz-nonexistent");

    const opts = options();
    expect(opts).toHaveLength(1);
    expect(
      (opts[0]?.textContent ?? "").includes("新規ディレクトリを作成"),
    ).toBe(true);

    // The listbox stays present (create is always reachable) and
    // aria-activedescendant resolves to the create option — no dangling id.
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
    const active = searchInput().getAttribute("aria-activedescendant");
    expect(active).not.toBeNull();
    expect(active).toBe(opts[0]?.id);
  });
});
