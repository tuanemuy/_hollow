// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EditorTitleProvider,
  useEditorTitle,
  useSetEditorTitle,
} from "../EditorTitleContext";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

describe("EditorTitleContext", () => {
  it("propagates the pushed title from the setter to the value reader", () => {
    let push: (t: string | null) => void = () => {};

    function Setter() {
      push = useSetEditorTitle();
      return null;
    }
    function Reader() {
      const title = useEditorTitle();
      return <span data-testid="title">{title ?? "∅"}</span>;
    }

    act(() => {
      root.render(
        <EditorTitleProvider>
          <Setter />
          <Reader />
        </EditorTitleProvider>,
      );
    });

    const read = () =>
      container.querySelector('[data-testid="title"]')?.textContent;

    expect(read()).toBe("∅");

    act(() => {
      push("Q2 計画");
    });
    expect(read()).toBe("Q2 計画");

    act(() => {
      push(null);
    });
    expect(read()).toBe("∅");
  });

  it("keeps the setter reference stable across re-renders (ADR-003)", () => {
    const setters: Array<(t: string | null) => void> = [];

    // `tick` forces `Setter` to re-render on each root.render (new props),
    // standing in for `NoteEditor` re-rendering on its own reducer per
    // keystroke. The setter it reads must stay identical, or the push effect
    // would re-run every keystroke.
    function Setter({ tick }: { tick: number }) {
      setters.push(useSetEditorTitle());
      return <span>{tick}</span>;
    }

    act(() => {
      root.render(
        <EditorTitleProvider>
          <Setter tick={0} />
        </EditorTitleProvider>,
      );
    });
    act(() => {
      root.render(
        <EditorTitleProvider>
          <Setter tick={1} />
        </EditorTitleProvider>,
      );
    });

    expect(setters.length).toBeGreaterThanOrEqual(2);
    expect(setters.every((s) => s === setters[0])).toBe(true);
  });
});
