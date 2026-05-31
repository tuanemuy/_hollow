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

describe("DirectorySelectField", () => {
  it("renders every option initially and narrows via the filter", () => {
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

    act(() => {
      getInput().focus();
      pressKey("ArrowDown");
    });
    act(() => {
      pressKey("Enter");
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("work");
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

    act(() => {
      pressKey("Enter", { isComposing: true });
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("marks the matching option aria-selected for the current value", () => {
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
    const selected = listOptions().filter(
      (o) => o.getAttribute("aria-selected") === "true",
    );
    expect(selected.length).toBe(1);
    expect(selected[0].textContent ?? "").toContain("Work");
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
    const opts = listOptions();
    expect(opts.length).toBe(2);
    expect(opts[0].textContent ?? "").toContain("（ルート）");
  });

  it("shows the empty label and renders no listbox when nothing matches", () => {
    act(() => {
      root.render(
        <DirectorySelectField
          label="移動先"
          options={options}
          value={null}
          onChange={() => {}}
          emptyLabel="未選択"
        />,
      );
    });
    act(() => {
      typeQuery("zzz");
    });
    expect(listOptions().length).toBe(0);
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    const live = document.body.querySelector("[data-empty]");
    expect(live?.textContent ?? "").toBe("未選択");
  });
});
