// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrontMatterEditor } from "../FrontMatterEditor";

type Handlers = {
  onToggleMode: import("vitest").Mock<(...args: []) => void>;
  onSetField: import("vitest").Mock<(key: string, value: unknown) => void>;
  onRenameKey: import("vitest").Mock<(oldKey: string, newKey: string) => void>;
  onAddKey: import("vitest").Mock<(key: string) => void>;
  onSetRawJson: import("vitest").Mock<(value: string) => void>;
};

function makeHandlers(): Handlers {
  return {
    onToggleMode: vi.fn<(...args: []) => void>(),
    onSetField: vi.fn<(key: string, value: unknown) => void>(),
    onRenameKey: vi.fn<(oldKey: string, newKey: string) => void>(),
    onAddKey: vi.fn<(key: string) => void>(),
    onSetRawJson: vi.fn<(value: string) => void>(),
  };
}

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

function getKeyInputs(): HTMLInputElement[] {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>(
      'input[aria-label="FrontMatter キー"]',
    ),
  );
}

// React 19 controlled inputs intercept the `value` setter on the
// HTMLInputElement / HTMLTextAreaElement prototypes. Tests must go
// through the native setter so React's synthetic onChange fires.
function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function getValueInput(key: string): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>(
    `input[aria-label="${key} の値"]`,
  );
}

function getDeleteButton(key: string): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(
    `button[aria-label="${key} を削除"]`,
  );
}

describe("FrontMatterEditor — structured mode arbitrary keys", () => {
  it("renders one row per key in insertion order", () => {
    const h = makeHandlers();
    act(() => {
      root.render(
        <FrontMatterEditor
          mode="structured"
          parsed={{ z: "1", a: "2", m: "3" }}
          rawJson=""
          parseError={null}
          {...h}
        />,
      );
    });
    const keyInputs = getKeyInputs();
    expect(keyInputs.map((i) => i.value)).toEqual(["z", "a", "m"]);
  });

  it("renders empty-state message when there are no keys", () => {
    const h = makeHandlers();
    act(() => {
      root.render(
        <FrontMatterEditor
          mode="structured"
          parsed={{}}
          rawJson="{}"
          parseError={null}
          {...h}
        />,
      );
    });
    expect(container.textContent).toContain("FrontMatter は空です");
    expect(getKeyInputs()).toHaveLength(0);
  });

  it("editing a primitive value dispatches setField immediately", () => {
    const h = makeHandlers();
    act(() => {
      root.render(
        <FrontMatterEditor
          mode="structured"
          parsed={{ title: "old" }}
          rawJson=""
          parseError={null}
          {...h}
        />,
      );
    });
    const input = getValueInput("title");
    expect(input).not.toBeNull();
    act(() => {
      if (!input) throw new Error("no input");
      typeInto(input, "new");
    });
    expect(h.onSetField).toHaveBeenCalledWith("title", "new");
  });

  it("the delete button dispatches setField(key, undefined)", () => {
    const h = makeHandlers();
    act(() => {
      root.render(
        <FrontMatterEditor
          mode="structured"
          parsed={{ title: "old" }}
          rawJson=""
          parseError={null}
          {...h}
        />,
      );
    });
    const button = getDeleteButton("title");
    expect(button).not.toBeNull();
    act(() => {
      button?.click();
    });
    expect(h.onSetField).toHaveBeenCalledWith("title", undefined);
  });

  it("renaming a key does NOT dispatch until blur (local buffer)", () => {
    const h = makeHandlers();
    act(() => {
      root.render(
        <FrontMatterEditor
          mode="structured"
          parsed={{ title: "x" }}
          rawJson=""
          parseError={null}
          {...h}
        />,
      );
    });
    const keyInput = getKeyInputs()[0];
    act(() => {
      typeInto(keyInput, "titl");
    });
    act(() => {
      typeInto(keyInput, "ti");
    });
    expect(h.onRenameKey).not.toHaveBeenCalled();
    act(() => {
      keyInput.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    expect(h.onRenameKey).toHaveBeenCalledTimes(1);
    expect(h.onRenameKey).toHaveBeenCalledWith("title", "ti");
  });

  it("renaming a key commits on Enter (blurs and dispatches)", () => {
    const h = makeHandlers();
    act(() => {
      root.render(
        <FrontMatterEditor
          mode="structured"
          parsed={{ a: "1" }}
          rawJson=""
          parseError={null}
          {...h}
        />,
      );
    });
    const keyInput = getKeyInputs()[0];
    keyInput.focus();
    act(() => {
      typeInto(keyInput, "alpha");
    });
    const ev = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      keyInput.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    // The Enter handler calls .blur(); React listens on `focusout` (which
    // bubbles), so fire that too to simulate the resulting commit.
    act(() => {
      keyInput.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    expect(h.onRenameKey).toHaveBeenCalledWith("a", "alpha");
  });

  it("renaming to the same key (no-op) does not dispatch", () => {
    const h = makeHandlers();
    act(() => {
      root.render(
        <FrontMatterEditor
          mode="structured"
          parsed={{ a: "1" }}
          rawJson=""
          parseError={null}
          {...h}
        />,
      );
    });
    const keyInput = getKeyInputs()[0];
    act(() => {
      keyInput.dispatchEvent(new Event("focusout", { bubbles: true }));
    });
    expect(h.onRenameKey).not.toHaveBeenCalled();
  });

  it("array values are rendered read-only with a delete escape hatch", () => {
    const h = makeHandlers();
    act(() => {
      root.render(
        <FrontMatterEditor
          mode="structured"
          parsed={{ tags: ["legacy", "draft"] }}
          rawJson=""
          parseError={null}
          {...h}
        />,
      );
    });
    expect(getValueInput("tags")).toBeNull();
    expect(container.textContent).toContain("array");
    expect(container.textContent).toContain(
      "複雑な値です。生編集（JSON）で編集してください",
    );
    const del = getDeleteButton("tags");
    expect(del).not.toBeNull();
    expect(del?.disabled).toBe(false);
  });

  it("the add-key button dispatches onAddKey with the trimmed buffer", () => {
    const h = makeHandlers();
    act(() => {
      root.render(
        <FrontMatterEditor
          mode="structured"
          parsed={{}}
          rawJson="{}"
          parseError={null}
          {...h}
        />,
      );
    });
    const addInput = container.querySelector<HTMLInputElement>(
      'input[aria-label="追加するキー名"]',
    );
    if (!addInput) throw new Error("no add input");
    act(() => {
      typeInto(addInput, "  mood  ");
    });
    const addBtn = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent === "キーを追加");
    if (!addBtn) throw new Error("no add button");
    expect(addBtn.disabled).toBe(false);
    act(() => {
      addBtn.click();
    });
    expect(h.onAddKey).toHaveBeenCalledWith("mood");
  });

  it("SUGGESTED_KEYS datalist does not include `tags` / `aliases` / `publish`", () => {
    const h = makeHandlers();
    act(() => {
      root.render(
        <FrontMatterEditor
          mode="structured"
          parsed={{}}
          rawJson="{}"
          parseError={null}
          {...h}
        />,
      );
    });
    const opts = Array.from(
      container.querySelectorAll<HTMLOptionElement>("datalist option"),
    ).map((o) => o.value);
    expect(opts).not.toContain("tags");
    expect(opts).not.toContain("aliases");
    expect(opts).not.toContain("publish");
    expect(opts).toEqual(
      expect.arrayContaining(["date", "description", "title", "slug"]),
    );
  });

  it("displays the parseError surfaced by the reducer (e.g. duplicate key)", () => {
    const h = makeHandlers();
    act(() => {
      root.render(
        <FrontMatterEditor
          mode="structured"
          parsed={{ a: "1" }}
          rawJson=""
          parseError="key already exists: a"
          {...h}
        />,
      );
    });
    const err = container.querySelector('[role="alert"]');
    expect(err?.textContent).toContain("already exists");
  });
});

describe("FrontMatterEditor — raw mode", () => {
  it("renders the raw textarea and forwards changes", () => {
    const h = makeHandlers();
    act(() => {
      root.render(
        <FrontMatterEditor
          mode="raw"
          parsed={{}}
          rawJson={`{ "a": 1 }`}
          parseError={null}
          {...h}
        />,
      );
    });
    const ta = container.querySelector<HTMLTextAreaElement>("textarea");
    expect(ta).not.toBeNull();
    expect(ta?.value).toBe(`{ "a": 1 }`);
    act(() => {
      if (!ta) throw new Error("no ta");
      typeInto(ta, `{ "b": 2 }`);
    });
    expect(h.onSetRawJson).toHaveBeenCalledWith(`{ "b": 2 }`);
  });

  it("surfaces parse errors when raw JSON is invalid", () => {
    const h = makeHandlers();
    act(() => {
      root.render(
        <FrontMatterEditor
          mode="raw"
          parsed={{}}
          rawJson={"{not json"}
          parseError={"Unexpected token"}
          {...h}
        />,
      );
    });
    expect(container.textContent).toContain("JSON が解析できません");
  });
});
