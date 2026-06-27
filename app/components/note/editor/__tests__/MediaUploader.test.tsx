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
let originalXhr: typeof XMLHttpRequest;
let originalCreateObjectURL: typeof URL.createObjectURL;
let originalRevokeObjectURL: typeof URL.revokeObjectURL;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  presignMediaMock.mockClear();
  finalizeMediaMock.mockClear();

  // Mock URL.createObjectURL and URL.revokeObjectURL
  originalCreateObjectURL = URL.createObjectURL;
  originalRevokeObjectURL = URL.revokeObjectURL;
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.clearAllMocks();

  // Restore URL methods
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

function findFileInput(): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (input === null) throw new Error("file input not found");
  return input;
}

function findAlertBanner(): HTMLElement | null {
  return container.querySelector('[role="alert"]');
}

function findStatusBanner(): HTMLElement | null {
  return container.querySelector('[role="status"]');
}

function findDropzone(): HTMLElement | null {
  return container.querySelector("label[aria-label*='メディア']");
}

async function uploadFile(file: File): Promise<void> {
  const input = findFileInput();
  await act(async () => {
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("MediaUploader component", () => {
  describe("validation rejection banner (unsupported format)", () => {
    it("displays error banner when PDF is uploaded", async () => {
      await act(async () => {
        root.render(
          <MediaUploader
            contentHtml="<p>existing</p>"
            onInsert={vi.fn()}
            disabled={false}
          />,
        );
      });

      const pdfFile = new File(["pdf-data"], "doc.pdf", {
        type: "application/pdf",
      });

      await uploadFile(pdfFile);

      const alert = findAlertBanner();
      expect(alert).not.toBeNull();
      expect(alert?.textContent ?? "").toContain("対応していない形式です");
      expect(alert?.textContent ?? "").toContain("doc.pdf");
    });

    it("does not call presignMediaUpload when validation rejects", async () => {
      await act(async () => {
        root.render(
          <MediaUploader
            contentHtml="<p>existing</p>"
            onInsert={vi.fn()}
            disabled={false}
          />,
        );
      });

      const pdfFile = new File(["pdf-data"], "doc.pdf", {
        type: "application/pdf",
      });

      await uploadFile(pdfFile);
      await act(async () => {
        await Promise.resolve();
      });

      expect(presignMediaMock).not.toHaveBeenCalled();
    });

    it("keeps dropzone visible after validation rejection", async () => {
      await act(async () => {
        root.render(
          <MediaUploader
            contentHtml="<p>existing</p>"
            onInsert={vi.fn()}
            disabled={false}
          />,
        );
      });

      const pdfFile = new File(["pdf-data"], "doc.pdf", {
        type: "application/pdf",
      });

      await uploadFile(pdfFile);

      const dropzone = findDropzone();
      expect(dropzone).not.toBeNull();
      expect(dropzone?.getAttribute("aria-label")).toContain("メディアを挿入");
    });

    it("displays oversized error when file exceeds limit", async () => {
      await act(async () => {
        root.render(
          <MediaUploader
            contentHtml="<p>existing</p>"
            onInsert={vi.fn()}
            disabled={false}
          />,
        );
      });

      const sixGiB = 6 * 1024 * 1024 * 1024;
      const largeFile = new File(["data"], "large.jpg", { type: "image/jpeg" });
      Object.defineProperty(largeFile, "size", { value: sixGiB });

      await uploadFile(largeFile);

      const alert = findAlertBanner();
      expect(alert).not.toBeNull();
      expect(alert?.textContent ?? "").toContain(
        "ファイルサイズが大きすぎます",
      );
    });
  });

  describe("successful upload flow", () => {
    beforeEach(() => {
      // Mock XHR for successful upload
      const originalXHRClass = globalThis.XMLHttpRequest;
      originalXhr = originalXHRClass;

      class MockXHR {
        status = 200;
        upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
        onload: ((this: MockXHR) => void) | null = null;
        onerror: ((this: MockXHR) => void) | null = null;
        onabort: ((this: MockXHR) => void) | null = null;
        ontimeout: ((this: MockXHR) => void) | null = null;
        requestUrl = "";
        requestHeaders: Record<string, string> = {};
        requestBody: File | null = null;

        open(_method: string, url: string) {
          this.requestUrl = url;
        }

        setRequestHeader(name: string, value: string) {
          this.requestHeaders[name] = value;
        }

        send(data: File | string | Document | XMLHttpRequestBodyInit) {
          this.requestBody = data as File;
          // Simulate successful upload via microtask
          queueMicrotask(() => {
            if (this.onload) {
              this.onload.call(this);
            }
          });
        }
      }

      vi.stubGlobal(
        "XMLHttpRequest",
        MockXHR as unknown as typeof XMLHttpRequest,
      );
    });

    afterEach(() => {
      if (originalXhr) {
        vi.stubGlobal("XMLHttpRequest", originalXhr);
      }
    });

    it("calls presignMediaUpload with correct payload", async () => {
      presignMediaMock.mockResolvedValueOnce({
        mediaId: "m1",
        uploadUrl: "https://r2.example/put",
        expectedDownloadUrl: "https://cdn/m1",
      });
      finalizeMediaMock.mockResolvedValueOnce({
        mediaId: "m1",
        byteSize: 1234,
        mimeType: "image/png",
        url: "/media/m1",
      });

      const onInsert = vi.fn();
      await act(async () => {
        root.render(
          <MediaUploader contentHtml="<p>existing</p>" onInsert={onInsert} />,
        );
      });

      const imageFile = new File(["img-data"], "pic.png", {
        type: "image/png",
      });
      Object.defineProperty(imageFile, "size", { value: 1234 });

      await uploadFile(imageFile);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(presignMediaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: "image",
            mimeType: "image/png",
            byteSize: 1234,
          }),
        }),
      );
    });

    it("calls finalizeMediaUpload after successful PUT", async () => {
      presignMediaMock.mockResolvedValueOnce({
        mediaId: "m1",
        uploadUrl: "https://r2.example/put",
        expectedDownloadUrl: "https://cdn/m1",
      });
      finalizeMediaMock.mockResolvedValueOnce({
        mediaId: "m1",
        byteSize: 1234,
        mimeType: "image/png",
        url: "/media/m1",
      });

      const onInsert = vi.fn();
      await act(async () => {
        root.render(
          <MediaUploader contentHtml="<p>existing</p>" onInsert={onInsert} />,
        );
      });

      const imageFile = new File(["img-data"], "pic.png", {
        type: "image/png",
      });

      await uploadFile(imageFile);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(finalizeMediaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mediaId: "m1",
          }),
        }),
      );
    });

    it("calls onInsert callback with correct parameters", async () => {
      presignMediaMock.mockResolvedValueOnce({
        mediaId: "m1",
        uploadUrl: "https://r2.example/put",
        expectedDownloadUrl: "https://cdn/m1",
      });
      finalizeMediaMock.mockResolvedValueOnce({
        mediaId: "m1",
        byteSize: 1234,
        mimeType: "image/png",
        url: "/media/m1",
      });

      const onInsert = vi.fn();
      const initialHtml = "<p>existing</p>";
      await act(async () => {
        root.render(
          <MediaUploader contentHtml={initialHtml} onInsert={onInsert} />,
        );
      });

      const imageFile = new File(["img-data"], "pic.png", {
        type: "image/png",
      });

      await uploadFile(imageFile);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(onInsert).toHaveBeenCalledWith(
        expect.stringContaining('<img src="/media/m1"'),
        expect.objectContaining({
          id: "m1",
          url: "/media/m1",
        }),
      );
    });

    it("displays success banner after successful upload", async () => {
      presignMediaMock.mockResolvedValueOnce({
        mediaId: "m1",
        uploadUrl: "https://r2.example/put",
        expectedDownloadUrl: "https://cdn/m1",
      });
      finalizeMediaMock.mockResolvedValueOnce({
        mediaId: "m1",
        byteSize: 1234,
        mimeType: "image/png",
        url: "/media/m1",
      });

      const onInsert = vi.fn();
      await act(async () => {
        root.render(
          <MediaUploader contentHtml="<p>existing</p>" onInsert={onInsert} />,
        );
      });

      const imageFile = new File(["img-data"], "pic.png", {
        type: "image/png",
      });

      await uploadFile(imageFile);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      const statusBanner = findStatusBanner();
      expect(statusBanner).not.toBeNull();
      expect(statusBanner?.textContent ?? "").toContain("ノートに挿入しました");
      expect(statusBanner?.textContent ?? "").toContain("pic.png");
    });

    it("accepts video files and determines kind correctly", async () => {
      presignMediaMock.mockResolvedValueOnce({
        mediaId: "v1",
        uploadUrl: "https://r2.example/put",
        expectedDownloadUrl: "https://cdn/v1",
      });
      finalizeMediaMock.mockResolvedValueOnce({
        mediaId: "v1",
        byteSize: 5000,
        mimeType: "video/mp4",
        url: "/media/v1",
      });

      const onInsert = vi.fn();
      await act(async () => {
        root.render(
          <MediaUploader contentHtml="<p>existing</p>" onInsert={onInsert} />,
        );
      });

      const videoFile = new File(["video-data"], "movie.mp4", {
        type: "video/mp4",
      });

      await uploadFile(videoFile);
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(presignMediaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            kind: "video",
            mimeType: "video/mp4",
          }),
        }),
      );
    });
  });

  describe("disabled state", () => {
    it("does not accept file uploads when disabled is true", async () => {
      const onInsert = vi.fn();
      await act(async () => {
        root.render(
          <MediaUploader
            contentHtml="<p>existing</p>"
            onInsert={onInsert}
            disabled={true}
          />,
        );
      });

      const input = findFileInput();
      expect(input.disabled).toBe(true);
    });

    it("disables dropzone interaction when disabled is true", async () => {
      const onInsert = vi.fn();
      await act(async () => {
        root.render(
          <MediaUploader
            contentHtml="<p>existing</p>"
            onInsert={onInsert}
            disabled={true}
          />,
        );
      });

      const dropzone = findDropzone();
      expect(dropzone?.getAttribute("data-disabled")).toBe("true");
    });
  });
});
