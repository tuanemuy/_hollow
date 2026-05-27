// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import { AppServerError } from "@/core/presentation/errorResponse";
import type { IngestionJobWire } from "../actions";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Per-server-fn mocks. The form uses `commitIngestionPreviewFn` and
// `discardIngestionPreviewFn`; identity-dispatch via the imported
// references below keeps the two mocks separated so we can assert
// commit vs discard behaviour independently (B-T-001 regression).
const commitMock = vi.fn();
const discardMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter(
    [
      [commitMock, commitMock],
      [discardMock, discardMock],
    ],
    vi.fn(),
  ),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../actions", () => ({
  commitIngestionPreviewFn: commitMock,
  discardIngestionPreviewFn: discardMock,
}));

const routerInvalidate = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", () => {
  return {
    useRouter: () => ({
      invalidate: routerInvalidate,
      navigate: vi.fn().mockResolvedValue(undefined),
    }),
    Link: ({
      children,
      ...rest
    }: { children: React.ReactNode } & Record<string, unknown>) => {
      const props = rest as Record<string, unknown>;
      return <a {...(props as Record<string, string>)}>{children}</a>;
    },
  };
});

const { IngestionPreviewForm } = await import("../IngestionPreviewForm");

const sampleJob: IngestionJobWire = {
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
    frontMatterJson: JSON.stringify({ status: "draft" }),
    suggestedTagNames: ["alpha", "beta"],
    internalLinkRefs: [],
    mediaRefs: [],
  },
  errorCode: null,
  regenerationCount: 0,
  savedAsNoteId: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const pendingDirJob: IngestionJobWire = {
  ...sampleJob,
  preview: {
    ...sampleJob.preview!,
    suggestedDirectoryId: null,
    suggestedDirectoryName: "ideas",
  },
};

const emptyFrontMatterJob: IngestionJobWire = {
  ...sampleJob,
  preview: {
    ...sampleJob.preview!,
    frontMatterJson: "{}",
  },
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  commitMock.mockReset();
  discardMock.mockReset();
  routerInvalidate.mockClear();
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

function setNativeInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  v: string,
) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function getTitleInput(): HTMLInputElement {
  const inputs =
    document.body.querySelectorAll<HTMLInputElement>('input[type="text"]');
  const first = inputs[0];
  if (first === undefined) throw new Error("title input not rendered");
  return first;
}

function getFrontMatterTextarea(): HTMLTextAreaElement {
  const ta = document.body.querySelector<HTMLTextAreaElement>("textarea");
  if (ta === null) throw new Error("front-matter textarea not rendered");
  return ta;
}

function getSubmitButton(): HTMLButtonElement {
  const btn = document.body.querySelector<HTMLButtonElement>(
    'button[type="submit"]',
  );
  if (btn === null) throw new Error("submit button not rendered");
  return btn;
}

function getButtonByText(text: string): HTMLButtonElement {
  const buttons = document.body.querySelectorAll<HTMLButtonElement>("button");
  for (const b of buttons) {
    if ((b.textContent ?? "").trim() === text) return b;
  }
  throw new Error(`button with text ${text} not found`);
}

function renderForm(props: {
  job?: IngestionJobWire;
  onCommitted?: (id: string) => void;
  onDiscarded?: () => void;
  onCancel?: () => void;
}) {
  act(() => {
    root.render(
      <IngestionPreviewForm
        job={props.job ?? sampleJob}
        tree={[]}
        isTreeLoading={false}
        onCommitted={props.onCommitted ?? (() => {})}
        onDiscarded={props.onDiscarded ?? (() => {})}
        onCancel={props.onCancel ?? (() => {})}
      />,
    );
  });
}

describe("IngestionPreviewForm", () => {
  it("renders preview values into the form fields", () => {
    renderForm({});

    const title = getTitleInput();
    expect(title.value).toBe("Suggested Title");

    const ta = getFrontMatterTextarea();
    // Pretty-printed JSON object.
    expect(ta.value).toContain('"status"');
    expect(ta.value).toContain('"draft"');
  });

  it("sends the expected payload (including frontMatterJson) on submit", async () => {
    commitMock.mockResolvedValue({ noteId: "note-1" });
    const onCommitted = vi.fn();

    renderForm({ onCommitted });

    act(() => {
      setNativeInputValue(getTitleInput(), "My Title");
    });
    act(() => {
      setNativeInputValue(getFrontMatterTextarea(), '{"status":"published"}');
    });

    await act(async () => {
      getSubmitButton().click();
    });
    // Flush the microtask queue so the awaited commit resolves and
    // onCommitted gets called.
    await act(async () => {
      await Promise.resolve();
    });

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(discardMock).not.toHaveBeenCalled();
    const callArg = commitMock.mock.calls[0]?.[0];
    expect(callArg).toMatchObject({
      data: expect.objectContaining({
        jobId: "job-1",
        title: "My Title",
        directoryId: "dir-1",
        frontMatterJson: '{"status":"published"}',
        tagNames: ["alpha", "beta"],
      }),
    });
    expect(onCommitted).toHaveBeenCalledWith("note-1");
  });

  it("surfaces a server-returned error (e.g. FRONT_MATTER_JSON_INVALID) in the inline alert region without dismissing the form", async () => {
    const onCommitted = vi.fn();
    // `AppServerError` is the canonical channel used by the
    // error-response middleware. Throwing one out of the server-fn mock
    // mirrors what `extractSerializedError(e)` sees in production.
    const wrapped = new AppServerError({
      kind: "business",
      code: "FRONT_MATTER_JSON_INVALID",
      message: "FrontMatter JSON is not parseable",
    });
    commitMock.mockRejectedValue(wrapped);

    renderForm({ onCommitted });

    act(() => {
      setNativeInputValue(getTitleInput(), "Preserved Title");
    });
    act(() => {
      setNativeInputValue(getFrontMatterTextarea(), "not-json");
    });

    await act(async () => {
      getSubmitButton().click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(commitMock).toHaveBeenCalledTimes(1);
    expect(onCommitted).not.toHaveBeenCalled();
    const alert = document.body.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect((alert?.textContent ?? "").length).toBeGreaterThan(0);
    expect(getSubmitButton()).not.toBeNull();
    // W-T-005: other field values are retained after the invalid
    // submission so the user can fix the FrontMatter without redoing
    // the rest of the form.
    expect(getTitleInput().value).toBe("Preserved Title");
  });

  // B-T-001: clicking "破棄" must NOT submit the form. It must open
  // the ConfirmDialog and leave `commit` un-invoked. Regression guard
  // for ADR-012 (nested-form HTML bug). If `ConfirmDialog` is ever
  // moved back inside `<form>`, the submit click will fire the parent
  // form's onSubmit and this test will fail.
  it("clicking 破棄 opens the ConfirmDialog without invoking commit", async () => {
    renderForm({});

    await act(async () => {
      getButtonByText("破棄").click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(commitMock).not.toHaveBeenCalled();
    expect(discardMock).not.toHaveBeenCalled();
    // Confirm dialog text from `<ConfirmDialog>` should now be visible.
    expect(document.body.textContent).toContain("ジョブを破棄");
    expect(document.body.textContent).toContain("このジョブを破棄しますか");
  });

  // B-T-001 (continued): the Confirm dialog's "破棄" button calls
  // `discard` exactly once and then `onDiscarded`. `commit` must never
  // fire on this path.
  it("confirming 破棄 invokes discard exactly once and calls onDiscarded; commit is never called", async () => {
    discardMock.mockResolvedValue(undefined);
    const onDiscarded = vi.fn();
    const onCommitted = vi.fn();
    renderForm({ onDiscarded, onCommitted });

    await act(async () => {
      getButtonByText("破棄").click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    // The confirm dialog now has its own "破棄" button which is the
    // primary action. There are now two buttons with the text "破棄"
    // (one in the form, one in the confirm). `getButtonByText` returns
    // the first match — that is the form button; we need the confirm's.
    const allDiscards = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>("button"),
    ).filter((b) => (b.textContent ?? "").trim() === "破棄");
    const confirmDiscard = allDiscards[1] ?? allDiscards[0];
    expect(confirmDiscard).toBeDefined();

    await act(async () => {
      confirmDiscard?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(discardMock).toHaveBeenCalledTimes(1);
    expect(commitMock).not.toHaveBeenCalled();
    expect(onDiscarded).toHaveBeenCalledTimes(1);
    expect(onCommitted).not.toHaveBeenCalled();
  });

  // W-T-003: cancel button invokes onCancel and triggers neither
  // commit nor discard.
  it("clicking キャンセル invokes onCancel and never calls commit or discard", async () => {
    const onCancel = vi.fn();
    renderForm({ onCancel });

    await act(async () => {
      getButtonByText("キャンセル").click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(commitMock).not.toHaveBeenCalled();
    expect(discardMock).not.toHaveBeenCalled();
  });

  // W-T-004: pending directory name path — when the preview has no
  // suggestedDirectoryId but does have suggestedDirectoryName, the
  // payload must carry `directoryNameToCreate` and not `directoryId`.
  it("posts directoryNameToCreate when the preview suggests a not-yet-existing directory", async () => {
    commitMock.mockResolvedValue({ noteId: "note-1" });
    renderForm({ job: pendingDirJob });

    await act(async () => {
      getSubmitButton().click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const callArg = commitMock.mock.calls[0]?.[0];
    expect(callArg.data).toMatchObject({
      jobId: "job-1",
      directoryNameToCreate: "ideas",
    });
    expect(callArg.data).not.toHaveProperty("directoryId");
  });

  // W-T-006: empty frontMatterJson is omitted from the payload — the
  // wire contract says undefined means "do not modify".
  it("omits frontMatterJson from the payload when the textarea is empty", async () => {
    commitMock.mockResolvedValue({ noteId: "note-1" });
    renderForm({ job: emptyFrontMatterJob });

    // The empty `{}` preview formats to "" so the textarea is empty.
    expect(getFrontMatterTextarea().value).toBe("");

    await act(async () => {
      getSubmitButton().click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const callArg = commitMock.mock.calls[0]?.[0];
    expect(callArg.data).not.toHaveProperty("frontMatterJson");
  });
});
