// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import { AppServerError } from "@/core/presentation/errorResponse";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const uploadMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter([[uploadMock, uploadMock]], vi.fn()),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../actions", () => ({
  uploadFileFn: uploadMock,
}));

const invalidateMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: invalidateMock }),
}));

const { UploadForm } = await import("../UploadForm");

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  uploadMock.mockReset();
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

function findFileInput(): HTMLInputElement {
  const input =
    document.body.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error("file input not rendered");
  return input;
}

function dispatchFile(input: HTMLInputElement, files: File[]) {
  const fileList = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
    [Symbol.iterator]: function* () {
      for (const f of files) yield f;
    },
  } as unknown as FileList;
  Object.defineProperty(input, "files", { value: fileList, writable: false });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("UploadForm error path", () => {
  // Issue #221: when uploadFileFn throws a BusinessRuleError with code
  // `unsupported_format`, the UI must render the mapped Japanese
  // message — never the raw lowercase code.
  it("renders the mapped user-facing message for unsupported_format", async () => {
    uploadMock.mockRejectedValue(
      new AppServerError({
        kind: "business",
        code: "unsupported_format",
        message: "unsupported_format",
      }),
    );

    act(() => {
      root.render(<UploadForm />);
    });

    const file = new File(["x"], "evil.exe", {
      type: "application/octet-stream",
    });
    act(() => {
      dispatchFile(findFileInput(), [file]);
    });
    // useTransition needs several microtask flushes for the rejected
    // upload promise → catch → setError → re-render chain to land.
    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await Promise.resolve();
      });
    }

    const text = document.body.textContent ?? "";
    expect(text).toContain("このファイル形式には対応していません");
    expect(text).not.toContain("unsupported_format");
  });
});
