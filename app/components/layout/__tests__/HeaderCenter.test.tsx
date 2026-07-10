// @vitest-environment happy-dom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditorTitleProvider, useSetEditorTitle } from "../EditorTitleContext";
import { HeaderCenter } from "../HeaderCenter";

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

// Pushes a fixed title into the context so HeaderCenter reads it, mirroring
// how `useEditorTitleSync` feeds the value from the editor.
function TitleSeed({ title }: { title: string | null }) {
  const setTitle = useSetEditorTitle();
  useEffect(() => {
    setTitle(title);
  }, [title, setTitle]);
  return null;
}

function render(title: string | null) {
  act(() => {
    root.render(
      <EditorTitleProvider>
        <TitleSeed title={title} />
        <HeaderCenter>
          <form data-testid="search">
            <input type="search" />
          </form>
        </HeaderCenter>
      </EditorTitleProvider>,
    );
  });
}

const doc = () => container.querySelector('[aria-hidden="true"]');
const searchWrapper = () =>
  container.querySelector('[data-testid="search"]')?.parentElement ?? null;

describe("HeaderCenter", () => {
  it("shows only the search box when no title is set", () => {
    render(null);
    expect(doc()).toBeNull();
    // The search wrapper carries no `data-doc`, so it is not hidden on mobile.
    expect(searchWrapper()?.getAttribute("data-doc")).toBeNull();
    expect(container.querySelector('[data-testid="search"]')).not.toBeNull();
  });

  it("renders the decorative title and hides search on mobile when a title is present", () => {
    render("Q2 計画 — プロダクトレビューに向けて");
    const el = doc();
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe("Q2 計画 — プロダクトレビューに向けて");
    // `data-doc` drives `data-[doc]:max-sm:hidden` on the search wrapper so the
    // title replaces search on mobile (AC-8). Tailwind's `data-[doc]:` variant
    // keys off attribute presence, not value.
    expect(searchWrapper()?.hasAttribute("data-doc")).toBe(true);
  });

  it("treats a whitespace-only title as empty (search stays visible)", () => {
    render("   ");
    expect(doc()).toBeNull();
    expect(searchWrapper()?.getAttribute("data-doc")).toBeNull();
  });
});
