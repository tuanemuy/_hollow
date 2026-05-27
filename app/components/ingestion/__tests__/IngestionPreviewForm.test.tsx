// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppServerError } from "@/core/presentation/errorResponse";
import type { IngestionJobWire } from "../actions";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Shared mock — every server-fn the form uses resolves through this fn.
// Tests can inspect the latest call to verify payload shape.
const mockedFn = vi.fn();
vi.mock("@tanstack/react-start", () => {
  const chain = () =>
    new Proxy(() => chain(), {
      get: (_, prop) => (prop === "then" ? undefined : chain()),
    });
  return {
    useServerFn: () => mockedFn,
    createMiddleware: () => chain(),
    createServerFn: () => chain(),
  };
});

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
  errorReason: null,
  regenerationCount: 0,
  savedAsNoteId: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mockedFn.mockReset();
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

describe("IngestionPreviewForm", () => {
  it("renders preview values into the form fields", () => {
    act(() => {
      root.render(
        <IngestionPreviewForm
          job={sampleJob}
          tree={[]}
          isTreeLoading={false}
          onCommitted={() => {}}
          onDiscarded={() => {}}
          onCancel={() => {}}
        />,
      );
    });

    const title = getTitleInput();
    expect(title.value).toBe("Suggested Title");

    const ta = getFrontMatterTextarea();
    // Pretty-printed JSON object.
    expect(ta.value).toContain('"status"');
    expect(ta.value).toContain('"draft"');
  });

  it("sends the expected payload (including frontMatterJson) on submit", async () => {
    mockedFn.mockResolvedValue({ noteId: "note-1" });
    const onCommitted = vi.fn();

    act(() => {
      root.render(
        <IngestionPreviewForm
          job={sampleJob}
          tree={[]}
          isTreeLoading={false}
          onCommitted={onCommitted}
          onDiscarded={() => {}}
          onCancel={() => {}}
        />,
      );
    });

    act(() => {
      setNativeInputValue(getTitleInput(), "My Title");
    });
    act(() => {
      setNativeInputValue(getFrontMatterTextarea(), '{"status":"published"}');
    });

    await act(async () => {
      getSubmitButton().click();
    });
    // Flush the microtask queue so the awaited mockedFn resolves and
    // onCommitted gets called.
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedFn).toHaveBeenCalledTimes(1);
    const callArg = mockedFn.mock.calls[0]?.[0];
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
    mockedFn.mockRejectedValue(wrapped);

    act(() => {
      root.render(
        <IngestionPreviewForm
          job={sampleJob}
          tree={[]}
          isTreeLoading={false}
          onCommitted={onCommitted}
          onDiscarded={() => {}}
          onCancel={() => {}}
        />,
      );
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

    // The server-fn was invoked exactly once, the commit did not
    // navigate (onCommitted not called), and an alert region is now
    // visible. The exact wording of the message is owned by
    // `errorDisplay.ts` — we only assert that an inline error appears
    // and the form is still present.
    expect(mockedFn).toHaveBeenCalledTimes(1);
    expect(onCommitted).not.toHaveBeenCalled();
    const alert = document.body.querySelector('[role="alert"]');
    expect(alert).not.toBeNull();
    expect((alert?.textContent ?? "").length).toBeGreaterThan(0);
    // The form's submit button still exists (modal not dismissed).
    expect(getSubmitButton()).not.toBeNull();
  });
});
