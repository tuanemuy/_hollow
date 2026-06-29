// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let locationHash = "";

vi.mock("@tanstack/react-router", () => ({
  useLocation: ({ select }: { select: (l: { hash: string }) => string }) =>
    select({ hash: locationHash }),
  Link: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <a {...(rest as Record<string, unknown>)}>{children}</a>,
}));

const { UploadButton } = await import("../UploadButton");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  locationHash = "";
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

function renderButton() {
  act(() => {
    root.render(<UploadButton>アップロード</UploadButton>);
  });
}

const anchor = () => container.querySelector("a");

// #790: the unprocessed-job count moved to the sidebar upload nav item, so the
// header CTA is a static "start upload" button — no count badge, static label.
describe("UploadButton", () => {
  it("uses a static aria-label and renders no count chip", () => {
    renderButton();

    expect(anchor()?.getAttribute("aria-label")).toBe("アップロード");
    expect(container.querySelector("[data-queue-badge]")).toBeNull();
  });

  it("is not active when the hash is not #upload", () => {
    locationHash = "";
    renderButton();

    expect(anchor()?.getAttribute("data-active")).toBeNull();
    expect(anchor()?.getAttribute("aria-current")).toBeNull();
  });

  it("surfaces active state via data-active / aria-current when hash is #upload", () => {
    locationHash = "upload";
    renderButton();

    // `data-active={active || undefined}` renders the boolean as "true"; the
    // Tailwind `data-[active]:` variant tests for presence, not value.
    expect(anchor()?.getAttribute("data-active")).toBe("true");
    expect(anchor()?.getAttribute("aria-current")).toBe("page");
  });
});
