// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectorySelectField } from "../DirectorySelectField";

const options = [
  { id: "root", name: "", path: "/", depth: 0 },
  { id: "work", name: "Work", path: "/Work", depth: 1 },
  { id: "y2024", name: "2024", path: "/Work/2024", depth: 2 },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

function getInput(): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>(
    'input[role="combobox"]',
  );
  if (input === null) throw new Error("combobox input not rendered");
  return input;
}

function typeQuery(value: string) {
  const input = getInput();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressKey(key: string, init: KeyboardEventInit = {}) {
  getInput().dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
  );
}

function listOptions(): HTMLButtonElement[] {
  return Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('button[role="option"]'),
  );
}

// The listbox is closed until the combobox is focused / typed into, so each
// test opens it before querying for options.
function open() {
  act(() => {
    getInput().focus();
  });
}

describe("DirectorySelectField", () => {
  it("renders every option once opened and narrows via the filter", () => {
    act(() => {
      root.render(
        <DirectorySelectField
          label="移動先"
          options={options}
          value={null}
          onChange={() => {}}
        />,
      );
    });
    open();
    expect(listOptions().length).toBe(3);

    act(() => {
      typeQuery("2024");
    });
    const texts = listOptions().map((o) => o.textContent ?? "");
    expect(texts.length).toBe(1);
    expect(texts[0]).toContain("2024");
  });

  it("commits the active option via ArrowDown + Enter", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <DirectorySelectField
          label="移動先"
          options={options}
          value={null}
          onChange={onChange}
        />,
      );
    });

    open();
    act(() => {
      pressKey("ArrowDown");
    });
    act(() => {
      pressKey("Enter");
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("work");
  });

  it("collapses the listbox and clears the query on commit, then reopens with all options", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <DirectorySelectField
          label="移動先"
          options={options}
          value={null}
          onChange={onChange}
        />,
      );
    });

    open();
    // Narrow then commit the sole remaining row.
    act(() => {
      typeQuery("2024");
    });
    act(() => {
      pressKey("Enter");
    });

    // (a) the listbox is gone, (b) the input value is cleared.
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(getInput().value).toBe("");

    // (c) reopening the input (focus stays after commit, so re-trigger via
    // mousedown like a real click) shows the full list again.
    act(() => {
      getInput().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(listOptions().length).toBe(3);
  });

  it("ignores Enter fired during IME composition", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <DirectorySelectField
          label="移動先"
          options={options}
          value={null}
          onChange={onChange}
        />,
      );
    });

    open();
    act(() => {
      pressKey("Enter", { isComposing: true });
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("marks the active row aria-selected while navigating", () => {
    act(() => {
      root.render(
        <DirectorySelectField
          label="移動先"
          options={options}
          value="work"
          onChange={() => {}}
        />,
      );
    });
    open();
    const selected = listOptions().filter(
      (o) => o.getAttribute("aria-selected") === "true",
    );
    expect(selected.length).toBe(1);
    // The first row (root) is active by default, not the value-selected row.
    expect(selected[0]).toBe(listOptions()[0]);
  });

  it("synthesizes a root option from includeRootOption at the top", () => {
    act(() => {
      root.render(
        <DirectorySelectField
          label="移動先"
          options={[{ id: "work", name: "Work", path: "/Work", depth: 1 }]}
          value={null}
          onChange={() => {}}
          includeRootOption={{ id: "root", label: "（ルート）" }}
        />,
      );
    });
    open();
    const opts = listOptions();
    expect(opts.length).toBe(2);
    expect(opts[0].textContent ?? "").toContain("（ルート）");
  });

  it("commits includeRootOption via onChange(rootId)", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <DirectorySelectField
          label="移動先"
          options={[{ id: "work", name: "Work", path: "/Work", depth: 1 }]}
          value={null}
          onChange={onChange}
          includeRootOption={{ id: "root", label: "（ルート）" }}
        />,
      );
    });
    open();
    act(() => {
      pressKey("Enter");
    });
    expect(onChange).toHaveBeenCalledWith("root");
  });

  it("shows the empty label and renders no listbox when nothing matches", () => {
    act(() => {
      root.render(
        <DirectorySelectField
          label="移動先"
          options={options}
          value={null}
          onChange={() => {}}
          emptyLabel="該当なし"
        />,
      );
    });
    open();
    act(() => {
      typeQuery("zzz");
    });
    expect(listOptions().length).toBe(0);
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    const live = document.body.querySelector("[data-empty]");
    expect(live?.textContent ?? "").toBe("該当なし");
  });

  it("clamps the active index to the post-filter first row on commit", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <DirectorySelectField
          label="移動先"
          options={options}
          value={null}
          onChange={onChange}
        />,
      );
    });
    open();
    // Move to the last row (index 2 = y2024).
    act(() => {
      pressKey("ArrowDown");
      pressKey("ArrowDown");
    });
    // Narrow to a single row; the active index must clamp to 0 (the only row).
    act(() => {
      typeQuery("2024");
    });
    act(() => {
      pressKey("Enter");
    });
    expect(onChange).toHaveBeenCalledWith("y2024");
  });

  it("wraps ArrowUp from the first row to the last row", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <DirectorySelectField
          label="移動先"
          options={options}
          value={null}
          onChange={onChange}
        />,
      );
    });
    open();
    // Initial index 0 → ArrowUp wraps to the last row (y2024).
    act(() => {
      pressKey("ArrowUp");
    });
    act(() => {
      pressKey("Enter");
    });
    expect(onChange).toHaveBeenCalledWith("y2024");
  });

  it("clears the selection via the 解除 button when clearable", () => {
    const onChange = vi.fn();
    act(() => {
      root.render(
        <DirectorySelectField
          label="移動先"
          options={options}
          value="work"
          onChange={onChange}
          clearable
        />,
      );
    });
    const clearBtn = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="選択を解除"]',
    );
    if (clearBtn === null) throw new Error("clear button not rendered");
    act(() => {
      clearBtn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("collapses the listbox on Escape", () => {
    act(() => {
      root.render(
        <DirectorySelectField
          label="移動先"
          options={options}
          value={null}
          onChange={() => {}}
        />,
      );
    });
    open();
    expect(document.body.querySelector('[role="listbox"]')).not.toBeNull();
    act(() => {
      pressKey("Escape");
    });
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
  });

  it("stops Escape from bubbling while the listbox is open, but lets it bubble when closed", () => {
    act(() => {
      root.render(
        <DirectorySelectField
          label="移動先"
          options={options}
          value={null}
          onChange={() => {}}
        />,
      );
    });
    const documentListener = vi.fn();
    document.addEventListener("keydown", documentListener);
    try {
      // Listbox open → Escape collapses it and is stopped before reaching
      // the document (so a parent Dialog would NOT close).
      open();
      act(() => {
        pressKey("Escape");
      });
      expect(documentListener).not.toHaveBeenCalled();
      expect(document.body.querySelector('[role="listbox"]')).toBeNull();

      // Listbox now closed → a second Escape bubbles to the document, where
      // the Dialog's own handler would close the dialog.
      act(() => {
        pressKey("Escape");
      });
      expect(documentListener).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("keydown", documentListener);
    }
  });

  it("never opens the listbox or shows the 解除 button when disabled", () => {
    act(() => {
      root.render(
        <DirectorySelectField
          label="移動先"
          options={options}
          value="work"
          onChange={() => {}}
          clearable
          disabled
        />,
      );
    });
    open();
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    expect(listOptions().length).toBe(0);
    expect(
      document.body.querySelector('button[aria-label="選択を解除"]'),
    ).toBeNull();
  });
});
