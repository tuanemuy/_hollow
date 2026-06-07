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

const { UploadForm, validateUploadFiles } = await import("../UploadForm");

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

function makeFile(name: string, type: string, size = 1): File {
  const file = new File(["x"], name, { type });
  // happy-dom derives `size` from content; override so size-limit tests can
  // simulate large uploads without allocating real bytes.
  Object.defineProperty(file, "size", { value: size });
  return file;
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

async function flush() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const MB = 1024 * 1024;

describe("validateUploadFiles", () => {
  it("classifies supported, unsupported, and oversized files", () => {
    const ok = makeFile("photo.png", "image/png", 1 * MB);
    const bad = makeFile("archive.zip", "application/zip", 1 * MB);
    const big = makeFile("big.png", "image/png", 60 * MB);
    const result = validateUploadFiles([ok, bad, big]);
    expect(result.unsupported).toEqual(["archive.zip"]);
    expect(result.oversized.map((o) => o.name)).toEqual(["big.png"]);
    expect(result.accepted).toEqual([ok]);
  });

  it("falls back to extension when file.type is empty, and rejects no-extension", () => {
    // (d): empty MIME with a known extension passes via the extension fallback.
    const png = makeFile("photo.png", "", 1 * MB);
    const noExt = makeFile("archive", "", 1 * MB);
    const result = validateUploadFiles([png, noExt]);
    expect(result.accepted).toEqual([png]);
    expect(result.unsupported).toEqual(["archive"]);
  });

  it("formats the oversize label in MB", () => {
    const big = makeFile("big.png", "image/png", Math.round(72.4 * MB));
    const result = validateUploadFiles([big]);
    expect(result.oversized[0]?.sizeLabel).toBe("72.4 MB");
  });
});

describe("UploadForm client validation", () => {
  // (a): unsupported format renders the error banner and never calls upload.
  it("shows the unsupported-format banner and does not upload", async () => {
    act(() => {
      root.render(<UploadForm />);
    });
    act(() => {
      dispatchFile(findFileInput(), [
        makeFile("archive.zip", "application/zip", 1 * MB),
      ]);
    });
    await flush();
    const text = document.body.textContent ?? "";
    expect(text).toContain("対応外の形式が含まれています");
    expect(text).toContain("archive.zip");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  // (b): oversized file renders the warning banner and does not upload.
  it("shows the size-over banner and does not upload", async () => {
    act(() => {
      root.render(<UploadForm />);
    });
    act(() => {
      dispatchFile(findFileInput(), [
        makeFile("big.png", "image/png", 60 * MB),
      ]);
    });
    await flush();
    const text = document.body.textContent ?? "";
    expect(text).toContain("サイズ超過のファイル");
    expect(text).toContain("big.png");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  // Mixed batch: only accepted files reach the server fn.
  it("uploads only the accepted files when some are rejected", async () => {
    uploadMock.mockResolvedValue({ jobId: "j1" });
    act(() => {
      root.render(<UploadForm />);
    });
    act(() => {
      dispatchFile(findFileInput(), [
        makeFile("photo.png", "image/png", 1 * MB),
        makeFile("archive.zip", "application/zip", 1 * MB),
      ]);
    });
    await flush();
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  // Issue #221: a server-side error (for inputs that pass the client guard)
  // still renders the mapped Japanese message, never the raw code.
  it("renders the mapped server error message for inputs passing the client guard", async () => {
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
    act(() => {
      dispatchFile(findFileInput(), [
        makeFile("photo.png", "image/png", 1 * MB),
      ]);
    });
    await flush();
    const text = document.body.textContent ?? "";
    expect(text).toContain("このファイル形式には対応していません");
    expect(text).not.toContain("unsupported_format");
  });
});
