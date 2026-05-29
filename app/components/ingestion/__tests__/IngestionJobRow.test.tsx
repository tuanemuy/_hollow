// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import type { IngestionJobWire } from "../actions";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const commitMock = vi.fn();
const discardMock = vi.fn();
const regenerateMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter(
    [
      [commitMock, commitMock],
      [discardMock, discardMock],
      [regenerateMock, regenerateMock],
    ],
    vi.fn(),
  ),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../actions", () => ({
  commitIngestionPreviewFn: commitMock,
  discardIngestionPreviewFn: discardMock,
  regenerateIngestionPreviewFn: regenerateMock,
}));

const routerInvalidate = vi.fn().mockResolvedValue(undefined);
const routerNavigate = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    invalidate: routerInvalidate,
    navigate: routerNavigate,
  }),
  Link: ({
    children,
    ...rest
  }: {
    children: React.ReactNode;
    [key: string]: unknown;
  }) => <a {...(rest as Record<string, unknown>)}>{children}</a>,
}));

const previewingJobExistingDir: IngestionJobWire = {
  id: "job-1",
  ownerId: "owner-1",
  originalFileName: "doc.md",
  mimeType: "text/markdown",
  byteSize: 1024,
  kind: "markdown",
  status: "previewing",
  preview: {
    title: "Suggested Title",
    contentHtml: "<p>body</p>",
    suggestedDirectoryId: "dir-1",
    suggestedDirectoryName: null,
    frontMatterJson: "{}",
    suggestedTagNames: [],
    internalLinkRefs: [],
    mediaRefs: [],
  },
  errorCode: null,
  regenerationCount: 0,
  savedAsNoteId: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const previewingJobNewDir: IngestionJobWire = {
  ...previewingJobExistingDir,
  preview: {
    ...previewingJobExistingDir.preview!,
    suggestedDirectoryId: null,
    suggestedDirectoryName: "ideas",
  },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  commitMock.mockReset();
  discardMock.mockReset();
  regenerateMock.mockReset();
  routerInvalidate.mockClear();
  routerNavigate.mockClear();
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

function getSaveButton(): HTMLButtonElement {
  const buttons = document.body.querySelectorAll<HTMLButtonElement>("button");
  for (const b of buttons) {
    if ((b.textContent ?? "").includes("ノートとして保存")) return b;
  }
  throw new Error("'ノートとして保存' button not found");
}

async function renderRow(job: IngestionJobWire) {
  const { IngestionJobRow } = await import("../IngestionJobRow");
  act(() => {
    root.render(<IngestionJobRow job={job} />);
  });
}

describe("IngestionJobRow", () => {
  // Issue #306: commit パスで preview の suggested 値を server function に
  // 転送し、新規ディレクトリ作成時のみ rule 2 (生 router.invalidate) を
  // 呼ぶ regression guard。
  it("forwards suggestedDirectoryId as directoryId and does NOT call router.invalidate", async () => {
    commitMock.mockResolvedValue({ noteId: "note-1" });

    await renderRow(previewingJobExistingDir);

    await act(async () => {
      getSaveButton().click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(commitMock).toHaveBeenCalledTimes(1);
    const callArg = commitMock.mock.calls[0]?.[0];
    expect(callArg.data).toMatchObject({
      jobId: "job-1",
      directoryId: "dir-1",
    });
    expect(callArg.data).not.toHaveProperty("directoryNameToCreate");
    // 既存ディレクトリ選択は Sidebar tree を変えないため invalidate は呼ばれない
    expect(routerInvalidate).not.toHaveBeenCalled();
    expect(routerNavigate).toHaveBeenCalledTimes(1);
  });

  it("forwards suggestedDirectoryName as directoryNameToCreate and calls router.invalidate", async () => {
    commitMock.mockResolvedValue({ noteId: "note-2" });

    await renderRow(previewingJobNewDir);

    await act(async () => {
      getSaveButton().click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(commitMock).toHaveBeenCalledTimes(1);
    const callArg = commitMock.mock.calls[0]?.[0];
    expect(callArg.data).toMatchObject({
      jobId: "job-1",
      directoryNameToCreate: "ideas",
    });
    expect(callArg.data).not.toHaveProperty("directoryId");
    // rule 2: 新規ディレクトリ作成で Sidebar tree が変わるため _app も invalidate
    expect(routerInvalidate).toHaveBeenCalledTimes(1);
    expect(routerNavigate).toHaveBeenCalledTimes(1);
  });

  it("does not call router.invalidate when commit fails", async () => {
    commitMock.mockRejectedValue(new Error("commit failed"));

    await renderRow(previewingJobNewDir);

    await act(async () => {
      getSaveButton().click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(routerInvalidate).not.toHaveBeenCalled();
    expect(routerNavigate).not.toHaveBeenCalled();
  });
});
