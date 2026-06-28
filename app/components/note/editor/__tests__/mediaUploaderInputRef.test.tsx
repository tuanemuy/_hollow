// @vitest-environment happy-dom

import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";

/**
 * Issue #798: the optional `inputRef` prop must point at the internal
 * `<input type="file">` so a parent (the WYSIWYG toolbar) can trigger
 * file selection via `.click()` (AC-2/AC-4). The omitted-ref case fixes
 * the html/inline paths' no-regression (AC-5).
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const presignMediaMock = vi.fn();
const finalizeMediaMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter(
    [
      [presignMediaMock, presignMediaMock],
      [finalizeMediaMock, finalizeMediaMock],
    ],
    vi.fn(),
  ),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("@/components/media/actions", () => ({
  presignMediaUploadFn: presignMediaMock,
  finalizeMediaUploadFn: finalizeMediaMock,
}));

const { MediaUploader } = await import("../MediaUploader");

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
  vi.clearAllMocks();
});

describe("MediaUploader inputRef wiring", () => {
  it("points the provided ref at the internal file input after render", async () => {
    const inputRef = createRef<HTMLInputElement>();
    await act(async () => {
      root.render(
        <MediaUploader
          contentHtml="<p>x</p>"
          onInsert={vi.fn()}
          inputRef={inputRef}
        />,
      );
    });

    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(inputRef.current).toBe(input);
  });

  it("still renders the file input when inputRef is omitted (html/inline no-regression)", async () => {
    await act(async () => {
      root.render(<MediaUploader contentHtml="<p>x</p>" onInsert={vi.fn()} />);
    });

    const input =
      container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
  });
});
