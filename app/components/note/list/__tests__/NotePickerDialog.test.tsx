// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteId } from "@/core/application/dto/note";
import type { TagId } from "@/core/application/dto/tag";
import type { InternalLinkSuggestion } from "@/core/application/note/searchInternalLinkTargets";

// `useServerFn` is what the dialog uses to acquire the server-fn caller.
// We stub `@tanstack/react-start` entirely so the hook returns a vi.fn()
// shared across the test file via the `mockedFn` reference below. The
// vitest factory is hoisted, so the closure captures `mockedFn` lazily
// (resolves at call time, not at module init).
//
// `createMiddleware` and `createServerFn` are also stubbed because the
// production `actions.ts` calls them at module top-level when imported
// transitively by `NotePickerDialog`. The dialog only consumes the
// result of `useServerFn`, so the stubs only need to be call-chainable
// no-ops — they never get invoked through `useServerFn` since the hook
// itself returns `mockedFn` directly.
const mockedFn = vi.fn();
vi.mock("@tanstack/react-start", () => {
  const chain = () => new Proxy(() => chain(), { get: () => chain() });
  return {
    useServerFn: () => mockedFn,
    createMiddleware: () => chain(),
    createServerFn: () => chain(),
  };
});

// Import after vi.mock so the module under test resolves the mocked
// `@tanstack/react-start`.
const { NotePickerDialog } = await import("../NotePickerDialog");

const noteItem = (id: string, title: string): InternalLinkSuggestion => ({
  kind: "note",
  noteId: id as unknown as NoteId,
  title,
  slug: id,
});

const tagItem = (id: string, name: string): InternalLinkSuggestion => ({
  kind: "tag",
  tagId: id as unknown as TagId,
  name,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  mockedFn.mockReset();
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

function getInput(): HTMLInputElement {
  const input = document.body.querySelector<HTMLInputElement>(
    'input[role="combobox"]',
  );
  if (input === null) throw new Error("combobox input not rendered");
  return input;
}

function typeQuery(value: string) {
  const input = getInput();
  // React 19 controlled inputs intercept the `value` setter on the
  // HTMLInputElement prototype. We must go through the native setter so
  // React's synthetic onChange fires with the new value.
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressKey(key: string, init: KeyboardEventInit = {}) {
  const input = getInput();
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
  );
}

describe("NotePickerDialog", () => {
  it("does not call the server fn when the query is blank", async () => {
    act(() => {
      root.render(
        <NotePickerDialog open={true} onClose={() => {}} onSelect={() => {}} />,
      );
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(mockedFn).not.toHaveBeenCalled();
  });

  it("calls the server fn exactly once after 100ms of debounce", async () => {
    mockedFn.mockResolvedValue({ suggestions: [noteItem("n1", "Alpha")] });
    act(() => {
      root.render(
        <NotePickerDialog open={true} onClose={() => {}} onSelect={() => {}} />,
      );
    });

    act(() => {
      typeQuery("al");
    });
    expect(mockedFn).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(mockedFn).toHaveBeenCalledTimes(1);
  });

  it("single-flights rapid input by aborting the previous request", async () => {
    mockedFn.mockResolvedValue({ suggestions: [] });
    act(() => {
      root.render(
        <NotePickerDialog open={true} onClose={() => {}} onSelect={() => {}} />,
      );
    });

    act(() => {
      typeQuery("a");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    act(() => {
      typeQuery("ab");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    act(() => {
      typeQuery("abc");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(mockedFn).toHaveBeenCalledTimes(1);
    expect(mockedFn).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ query: "abc" }),
      }),
    );
  });

  it("moves aria-selected between options with ArrowDown / ArrowUp", async () => {
    mockedFn.mockResolvedValue({
      suggestions: [
        noteItem("n1", "Alpha"),
        noteItem("n2", "Beta"),
        noteItem("n3", "Gamma"),
      ],
    });
    act(() => {
      root.render(
        <NotePickerDialog open={true} onClose={() => {}} onSelect={() => {}} />,
      );
    });

    act(() => {
      typeQuery("a");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const options = () =>
      document.body.querySelectorAll<HTMLButtonElement>(
        'button[role="option"]',
      );
    expect(options().length).toBe(3);
    expect(options()[0].getAttribute("aria-selected")).toBe("true");

    act(() => {
      pressKey("ArrowDown");
    });
    expect(options()[0].getAttribute("aria-selected")).toBe("false");
    expect(options()[1].getAttribute("aria-selected")).toBe("true");

    act(() => {
      pressKey("ArrowDown");
    });
    expect(options()[2].getAttribute("aria-selected")).toBe("true");

    act(() => {
      pressKey("ArrowUp");
    });
    expect(options()[1].getAttribute("aria-selected")).toBe("true");
  });

  it("commits via onSelect on Enter (no router.navigate inside dialog)", async () => {
    mockedFn.mockResolvedValue({
      suggestions: [noteItem("n1", "Alpha"), noteItem("n2", "Beta")],
    });
    const onSelect = vi.fn();
    act(() => {
      root.render(
        <NotePickerDialog open={true} onClose={() => {}} onSelect={onSelect} />,
      );
    });

    act(() => {
      typeQuery("a");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    act(() => {
      pressKey("ArrowDown");
    });
    act(() => {
      pressKey("Enter");
    });

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("n2");
  });

  it("ignores Enter fired during IME composition", async () => {
    mockedFn.mockResolvedValue({ suggestions: [noteItem("n1", "Alpha")] });
    const onSelect = vi.fn();
    act(() => {
      root.render(
        <NotePickerDialog open={true} onClose={() => {}} onSelect={onSelect} />,
      );
    });

    act(() => {
      typeQuery("a");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    // happy-dom's KeyboardEvent supports `isComposing` via init dict.
    act(() => {
      pressKey("Enter", { isComposing: true });
    });

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("shows the error message when the server fn rejects", async () => {
    mockedFn.mockRejectedValue(new Error("boom"));
    act(() => {
      root.render(
        <NotePickerDialog open={true} onClose={() => {}} onSelect={() => {}} />,
      );
    });

    act(() => {
      typeQuery("a");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
      // Allow the rejected promise to settle.
      await Promise.resolve();
      await Promise.resolve();
    });

    const alert = document.body.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent ?? "").not.toBe("");
  });

  it("filters tag-kind suggestions out of the listbox", async () => {
    mockedFn.mockResolvedValue({
      suggestions: [
        noteItem("n1", "Alpha"),
        tagItem("t1", "alpha-tag"),
        noteItem("n2", "Beta"),
      ],
    });
    act(() => {
      root.render(
        <NotePickerDialog open={true} onClose={() => {}} onSelect={() => {}} />,
      );
    });

    act(() => {
      typeQuery("a");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    const options = document.body.querySelectorAll<HTMLButtonElement>(
      'button[role="option"]',
    );
    expect(options.length).toBe(2);
    const texts = Array.from(options).map((o) => o.textContent ?? "");
    expect(texts.some((t) => t.includes("Alpha"))).toBe(true);
    expect(texts.some((t) => t.includes("Beta"))).toBe(true);
    expect(texts.some((t) => t.includes("alpha-tag"))).toBe(false);
  });
});
