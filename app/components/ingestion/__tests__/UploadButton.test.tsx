// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const getCountMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter([[getCountMock, getCountMock]], vi.fn()),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../actions", () => ({
  getIngestionQueueCountFn: getCountMock,
}));

vi.mock("../queueBadgeBus", () => ({
  notifyIngestionQueueChanged: vi.fn(),
  subscribeIngestionQueueChanged: () => () => {},
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: ({ select }: { select: (l: { hash: string }) => string }) =>
    select({ hash: "" }),
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
  getCountMock.mockReset();
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

async function renderButton() {
  act(() => {
    root.render(<UploadButton>アップロード</UploadButton>);
  });
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const anchor = () => container.querySelector("a");
const chip = () => container.querySelector("[data-queue-badge]");

// ADR-005-1: `aria-label` overrides descendant text, so the unprocessed-job
// count must live in the CTA's own label. These tests pin the real
// UploadButton wiring (hook → aria-label → badge child), not a harness copy.
describe("UploadButton", () => {
  it("carries the count in its aria-label and renders the chip when count > 0", async () => {
    getCountMock.mockResolvedValue({ count: 3 });
    await renderButton();

    expect(anchor()?.getAttribute("aria-label")).toBe(
      "アップロード（未処理 3 件）",
    );
    expect(chip()?.textContent).toBe("3");
  });

  it("falls back to the plain label and hides the chip at 0", async () => {
    getCountMock.mockResolvedValue({ count: 0 });
    await renderButton();

    expect(anchor()?.getAttribute("aria-label")).toBe("アップロード");
    expect(chip()).toBeNull();
  });
});
