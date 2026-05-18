// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InternalLinkSuggestion } from "@/core/application/note/searchInternalLinkTargets";
import { InternalLinkSuggestPopup } from "../InternalLinkSuggestPopup";

const POSITION = { left: 10, top: 20 };

const noteItem = (id: string, title: string): InternalLinkSuggestion => ({
  kind: "note",
  noteId: id,
  title,
  slug: id,
});

const tagItem = (id: string, name: string): InternalLinkSuggestion => ({
  kind: "tag",
  tagId: id,
  name,
});

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

describe("InternalLinkSuggestPopup", () => {
  it("renders the empty-state label when there are no items", () => {
    act(() => {
      root.render(
        <InternalLinkSuggestPopup
          items={[]}
          selectedIndex={0}
          onSelect={() => {}}
          onHover={() => {}}
          position={POSITION}
        />,
      );
    });
    expect(container.querySelector(".suggest-empty")?.textContent).toBe(
      "候補なし",
    );
    expect(container.querySelectorAll('[role="option"]').length).toBe(0);
  });

  it("renders one `role=option` per item", () => {
    const items = [
      noteItem("n1", "Note A"),
      noteItem("n2", "Note B"),
      tagItem("t1", "draft"),
    ];
    act(() => {
      root.render(
        <InternalLinkSuggestPopup
          items={items}
          selectedIndex={0}
          onSelect={() => {}}
          onHover={() => {}}
          position={POSITION}
        />,
      );
    });
    const options = container.querySelectorAll('[role="option"]');
    expect(options.length).toBe(3);
  });

  it("marks only the selected row with aria-selected=true", () => {
    const items = [
      noteItem("n1", "A"),
      noteItem("n2", "B"),
      tagItem("t1", "x"),
    ];
    act(() => {
      root.render(
        <InternalLinkSuggestPopup
          items={items}
          selectedIndex={1}
          onSelect={() => {}}
          onHover={() => {}}
          position={POSITION}
        />,
      );
    });
    const options = container.querySelectorAll('[role="option"]');
    expect(options[0].getAttribute("aria-selected")).toBe("false");
    expect(options[1].getAttribute("aria-selected")).toBe("true");
    expect(options[2].getAttribute("aria-selected")).toBe("false");
  });

  it("invokes onSelect with the clicked item on mousedown (preventDefault)", () => {
    const items = [noteItem("n1", "A"), tagItem("t1", "x")];
    const onSelect = vi.fn();
    act(() => {
      root.render(
        <InternalLinkSuggestPopup
          items={items}
          selectedIndex={0}
          onSelect={onSelect}
          onHover={() => {}}
          position={POSITION}
        />,
      );
    });
    const options =
      container.querySelectorAll<HTMLButtonElement>('[role="option"]');
    const ev = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    act(() => {
      options[1].dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it("uses absolute positioning at the given coordinates", () => {
    act(() => {
      root.render(
        <InternalLinkSuggestPopup
          items={[]}
          selectedIndex={0}
          onSelect={() => {}}
          onHover={() => {}}
          position={{ left: 42, top: 84 }}
        />,
      );
    });
    const popup = container.querySelector<HTMLDivElement>(
      ".internal-link-suggest-popup",
    );
    expect(popup).not.toBeNull();
    expect(popup?.style.position).toBe("absolute");
    expect(popup?.style.left).toBe("42px");
    expect(popup?.style.top).toBe("84px");
  });
});
