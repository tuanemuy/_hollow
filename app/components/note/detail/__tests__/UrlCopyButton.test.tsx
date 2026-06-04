// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UrlCopyButton } from "../UrlCopyButton";

/**
 * Issue #459: locks the icon-only treatment of the URL-copy action — an
 * `aria-label`'d button with no visible label text, and an `sr-only`
 * `aria-live` status region so the success/error announcement survives without
 * a visible string stretching the toolbar's icon row.
 */

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

function render(props: { url?: string; label?: string } = {}) {
  act(() => {
    root.render(
      <UrlCopyButton url={props.url ?? "https://example.com/notes/abc"} />,
    );
  });
}

describe("UrlCopyButton", () => {
  it("renders an icon-only button with an accessible name and no visible text", () => {
    render();
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("aria-label")).toBe("URLをコピー");
    expect(button.getAttribute("title")).toBe("URLをコピー");
    expect(button.textContent).toBe("");
    const svg = button.querySelector("svg");
    expect(svg).not.toBeNull();
    // The icon stays decorative — accessible name comes from the button only.
    expect(svg?.getAttribute("aria-label")).toBeNull();
  });

  it("exposes a screen-reader-only aria-live status region wired to the button", () => {
    render();
    const status = container.querySelector('[role="status"]') as HTMLElement;
    expect(status).not.toBeNull();
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.className).toContain("sr-only");
    const button = container.querySelector("button") as HTMLButtonElement;
    expect(button.getAttribute("aria-describedby")).toBe(status.id);
    // Idle: the live region carries no announcement yet.
    expect(status.textContent).toBe("");
  });
});
