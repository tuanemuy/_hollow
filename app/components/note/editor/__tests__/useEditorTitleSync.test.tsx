// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EditorTitleProvider,
  useEditorTitle,
} from "@/components/layout/EditorTitleContext";
import { useEditorTitleSync } from "@/components/note/editor/useEditorTitleSync";

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

function Harness({ title }: { title: string | null }) {
  useEditorTitleSync(title);
  return null;
}

function Probe() {
  const title = useEditorTitle();
  return <span data-testid="probe">{title ?? "∅"}</span>;
}

const read = () =>
  container.querySelector('[data-testid="probe"]')?.textContent;

function mount(title: string | null) {
  act(() => {
    root.render(
      <EditorTitleProvider>
        <Harness title={title} />
        <Probe />
      </EditorTitleProvider>,
    );
  });
}

function rerender(title: string | null) {
  act(() => {
    root.render(
      <EditorTitleProvider>
        <Harness title={title} />
        <Probe />
      </EditorTitleProvider>,
    );
  });
}

describe("useEditorTitleSync", () => {
  it("pushes the initial title on mount (AC-1 edit mode)", () => {
    mount("Hello");
    expect(read()).toBe("Hello");
  });

  it("pushes the latest title as it changes (AC-1 new-note typing)", () => {
    // A new note starts with an empty string; the harness pushes it verbatim
    // (HeaderCenter treats empty/whitespace as "no title" itself).
    mount("");
    expect(read()).toBe("");

    rerender("H");
    expect(read()).toBe("H");
    rerender("He");
    expect(read()).toBe("He");
  });

  it("clears the title to null on unmount (AC-6 leak prevention)", () => {
    // Mount the harness under its own provider so we can unmount just the
    // harness subtree while a sibling reader (also under the provider) would
    // observe the cleanup. Here we assert via the provider value going back to
    // null after the harness unmounts.
    let showHarness = true;
    function Switcher() {
      return showHarness ? <Harness title="Draft" /> : null;
    }

    act(() => {
      root.render(
        <EditorTitleProvider>
          <Switcher />
          <Probe />
        </EditorTitleProvider>,
      );
    });
    expect(read()).toBe("Draft");

    showHarness = false;
    act(() => {
      root.render(
        <EditorTitleProvider>
          <Switcher />
          <Probe />
        </EditorTitleProvider>,
      );
    });
    expect(read()).toBe("∅");
  });
});
