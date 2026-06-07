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

const startExportMock = vi.fn();
const enqueueExportMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter(
    [
      [startExportMock, startExportMock],
      [enqueueExportMock, enqueueExportMock],
    ],
    vi.fn(),
  ),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../action", () => ({
  startExportFn: startExportMock,
  enqueueExportFn: enqueueExportMock,
}));

const invalidateMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: invalidateMock }),
}));

const { ExportForm } = await import("../index");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  startExportMock.mockReset();
  enqueueExportMock.mockReset();
  invalidateMock.mockClear();
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

function findTextarea(): HTMLTextAreaElement {
  const el = document.body.querySelector("textarea");
  if (el === null) throw new Error("textarea not rendered");
  return el;
}

function setTextarea(value: string) {
  const ta = findTextarea();
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )?.set;
  setter?.call(ta, value);
  ta.dispatchEvent(new Event("input", { bubbles: true }));
}

function findMediaCheckbox(): HTMLInputElement {
  // The "メディアを埋め込む" checkbox is the second checkbox in the form.
  const boxes = document.body.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  const box = boxes.item(1);
  if (box === undefined) throw new Error("media checkbox not rendered");
  return box;
}

function bannerText(): string {
  const note = document.body.querySelector('[role="note"]');
  return note?.textContent ?? "";
}

describe("ExportForm async-job recommendation banner", () => {
  // (c-1): bulk with count > 50 shows the banner.
  it("shows the banner for bulk with more than 50 notes", () => {
    act(() => {
      root.render(<ExportForm noteId={null} />);
    });
    const ids = Array.from({ length: 51 }, (_, i) => `n${i}`).join("\n");
    act(() => {
      setTextarea(ids);
    });
    expect(bannerText()).toContain("非同期ジョブを推奨します");
    expect(bannerText()).toContain("51 件");
  });

  // (c-2): bulk with <= 50 notes but embedMedia ON (default) shows the banner.
  it("shows the banner for bulk with embedMedia on even under 50 notes", () => {
    act(() => {
      root.render(<ExportForm noteId={null} />);
    });
    const ids = Array.from({ length: 12 }, (_, i) => `n${i}`).join("\n");
    act(() => {
      setTextarea(ids);
    });
    // embedMedia defaults to true, so the banner shows for 12 notes.
    expect(bannerText()).toContain("非同期ジョブを推奨します");
    expect(bannerText()).toContain("12 件");
  });

  // (c-2 cont.): with embedMedia off and <= 50 notes the banner disappears.
  it("hides the banner when embedMedia is off and count is under 50", () => {
    act(() => {
      root.render(<ExportForm noteId={null} />);
    });
    const ids = Array.from({ length: 12 }, (_, i) => `n${i}`).join("\n");
    act(() => {
      setTextarea(ids);
    });
    act(() => {
      const box = findMediaCheckbox();
      box.click();
    });
    expect(document.body.querySelector('[role="note"]')).toBeNull();
  });

  // (c-3): single export never shows the banner.
  it("does not show the banner for single-note export", () => {
    act(() => {
      root.render(<ExportForm noteId="note-1" />);
    });
    expect(document.body.querySelector('[role="note"]')).toBeNull();
  });

  // (c-3): bulk with an empty textarea (0 notes) shows nothing.
  it("does not show the banner for bulk with zero notes", () => {
    act(() => {
      root.render(<ExportForm noteId={null} />);
    });
    expect(document.body.querySelector('[role="note"]')).toBeNull();
  });
});
