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

  it("re-renders value subscribers but not setter-only subscribers on title churn (ADR-003)", () => {
    let push: (t: string | null) => void = () => {};
    let valueRenders = 0;
    let setterRenders = 0;

    // Counts are bumped in the render body, so each React render of the
    // component increments exactly once — the direct signal we need to prove
    // the split contexts actually isolate value churn from setter subscribers.
    function ValueConsumer() {
      valueRenders++;
      const title = useEditorTitle();
      return <span data-testid="value">{title ?? "∅"}</span>;
    }
    function SetterConsumer() {
      setterRenders++;
      push = useSetEditorTitle();
      return null;
    }

    act(() => {
      root.render(
        <EditorTitleProvider>
          <ValueConsumer />
          <SetterConsumer />
        </EditorTitleProvider>,
      );
    });
    expect(valueRenders).toBe(1);
    expect(setterRenders).toBe(1);

    act(() => {
      push("Q2 計画");
    });
    // The value subscriber re-renders to reflect the new title...
    expect(valueRenders).toBe(2);
    // ...while the setter-only subscriber does NOT: the stable-setter context
    // did not change, so value churn never reaches it. This is the effect
    // ADR-003 buys. Regressing to a single `{title,setTitle}` context (a new
    // object per provider render) would re-render this consumer too, flipping
    // the count to 2 and failing here.
    expect(setterRenders).toBe(1);

    act(() => {
      push("Q3 計画");
    });
    expect(valueRenders).toBe(3);
    expect(setterRenders).toBe(1);
  });

  it("does not re-render stable children when the title is pushed (ADR-006 children-as-prop bailout)", () => {
    let push: (t: string | null) => void = () => {};
    let childRenders = 0;

    function Pusher() {
      push = useSetEditorTitle();
      return null;
    }
    function CountedChild() {
      childRenders++;
      return <span data-testid="child">stable</span>;
    }

    // The children element is created once and handed to the provider as a
    // prop. The provider re-renders on every `setTitle`, but this element's
    // reference stays identical, so React skips re-reconciling the subtree
    // (canonical "children as prop" bailout, ADR-006). If the provider inlined
    // its subtree in its own body instead of passing `children` through, each
    // provider render would recreate the elements and `childRenders` would
    // climb with every keystroke — the exact regression this gate catches.
    const children = (
      <>
        <Pusher />
        <CountedChild />
      </>
    );

    act(() => {
      root.render(<EditorTitleProvider>{children}</EditorTitleProvider>);
    });
    expect(childRenders).toBe(1);

    act(() => {
      push("A");
    });
    act(() => {
      push("B");
    });

    // Provider re-rendered twice, yet the stable child never re-rendered.
    expect(childRenders).toBe(1);
  });
});
