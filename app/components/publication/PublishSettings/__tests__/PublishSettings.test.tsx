// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import type { ShareLinkDTO } from "@/core/application/publication";

/**
 * Issue #477 (TEST-W-001): locks the pending lift-up / `closable` aggregation
 * introduced for the in-context publish modal (ADR-004).
 *
 * Each `ShareLinkRow` owns a local `useTransition`; while a row mutation is in
 * flight the row mirrors `isPending=true` up to the parent, which counts the
 * in-flight rows and passes `closable={!anyPending}` to the `Dialog`. When
 * `closable === false` the Dialog renders both close paths disabled:
 *   - the opt-in × button (`aria-label="閉じる"`) gets the native `disabled`,
 *   - the in-body 閉じる button gets `disabled`.
 *
 * The invariants asserted here:
 *   1. a row mutation in flight makes both close controls `disabled`,
 *   2. completing the mutation restores `closable` (both re-enabled),
 *   3. unmounting the row mid-flight (modal closed) does not strand the
 *      counter — re-opening is closable again.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const changeVisibilityMock = vi.fn();
const issueLinkMock = vi.fn();
const revokeMock = vi.fn();
const setPasswordMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter(
    [
      [changeVisibilityMock, changeVisibilityMock],
      [issueLinkMock, issueLinkMock],
      [revokeMock, revokeMock],
      [setPasswordMock, setPasswordMock],
    ],
    vi.fn(),
  ),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../action", () => ({
  changeVisibilityFn: changeVisibilityMock,
  issueShareLinkFn: issueLinkMock,
  revokeShareLinkFn: revokeMock,
  setShareLinkPasswordFn: setPasswordMock,
}));

const invalidateMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: invalidateMock }),
}));

const { PublishSettings } = await import("../index");

const activeLink: ShareLinkDTO = {
  id: "link-1" as ShareLinkDTO["id"],
  noteId: "note-1" as ShareLinkDTO["noteId"],
  hasPassword: false,
  status: "active",
  createdAt: new Date(0).toISOString() as ShareLinkDTO["createdAt"],
  revokedAt: null,
  lastAccessedAt: null,
  url: "https://example.test/share/tok-1",
};

const baseInitial = {
  visibility: "unlisted" as const,
  publishedAt: null,
  links: [activeLink] as readonly ShareLinkDTO[],
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  changeVisibilityMock.mockReset();
  issueLinkMock.mockReset();
  revokeMock.mockReset();
  setPasswordMock.mockReset();
  invalidateMock.mockClear();
  window.sessionStorage.clear();
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

function closeButton(): HTMLButtonElement | undefined {
  return (
    (document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="閉じる"]',
    ) as HTMLButtonElement | null) ?? undefined
  );
}

function bodyCloseButton(): HTMLButtonElement | undefined {
  return Array.from(
    document.body.querySelectorAll<HTMLButtonElement>("button"),
  ).find((b) => (b.textContent ?? "").trim() === "閉じる");
}

function revokeButton(): HTMLButtonElement | undefined {
  return Array.from(
    document.body.querySelectorAll<HTMLButtonElement>("button"),
  ).find((b) => (b.textContent ?? "").trim() === "失効させる");
}

describe("PublishSettings pending / closable aggregation (Issue #477)", () => {
  it("disables both close paths while a row revoke is in flight, then restores them on completion", async () => {
    // Hand-controlled promise so the revoke transition stays in flight and the
    // pending state is observable before it resolves.
    let resolveRevoke: () => void = () => {};
    revokeMock.mockReturnValue(
      new Promise<void>((res) => {
        resolveRevoke = () => res();
      }),
    );

    act(() => {
      root.render(
        <PublishSettings
          open={true}
          onClose={() => {}}
          noteId="note-1"
          appUrl="https://example.test"
          publicNoteUrl="https://example.test/u/yk/quiet-interface-memo"
          initial={baseInitial}
        />,
      );
    });

    // Closable at rest: neither close control is disabled.
    expect(closeButton()?.disabled).toBe(false);
    expect(bodyCloseButton()?.disabled).toBe(false);

    const revoke = revokeButton();
    expect(revoke).toBeDefined();

    // Kick off the revoke; the transition is now pending (promise unresolved).
    await act(async () => {
      revoke?.click();
      await Promise.resolve();
    });

    expect(revokeMock).toHaveBeenCalledTimes(1);
    // anyPending → closable=false → both close controls disabled.
    expect(closeButton()?.disabled).toBe(true);
    expect(bodyCloseButton()?.disabled).toBe(true);

    // Resolve the mutation; the transition ends and closable recovers.
    await act(async () => {
      resolveRevoke();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(invalidateMock).toHaveBeenCalledTimes(1);
    expect(closeButton()?.disabled).toBe(false);
    expect(bodyCloseButton()?.disabled).toBe(false);
  });

  it("does not strand the pending counter when the row unmounts mid-flight (modal closed)", async () => {
    // Revoke promise that never resolves within the test; we close the modal
    // while it is in flight so the row (and its pending) unmount.
    revokeMock.mockReturnValue(new Promise<void>(() => {}));

    let openProp = true;
    const Renderer = ({ open }: { open: boolean }) => (
      <PublishSettings
        open={open}
        onClose={() => {}}
        noteId="note-1"
        appUrl="https://example.test"
        publicNoteUrl="https://example.test/u/yk/quiet-interface-memo"
        initial={baseInitial}
      />
    );

    act(() => {
      root.render(<Renderer open={openProp} />);
    });

    await act(async () => {
      revokeButton()?.click();
      await Promise.resolve();
    });
    // In flight: closable=false.
    expect(bodyCloseButton()?.disabled).toBe(true);

    // Close the modal mid-flight — Dialog unmounts the ShareLinkRow, whose
    // cleanup must decrement the parent counter back to 0.
    openProp = false;
    act(() => {
      root.render(<Renderer open={openProp} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    // Dialog children are unmounted while closed.
    expect(bodyCloseButton()).toBeUndefined();

    // Re-open: the counter must be back at 0, so the modal is closable again.
    openProp = true;
    act(() => {
      root.render(<Renderer open={openProp} />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(closeButton()?.disabled).toBe(false);
    expect(bodyCloseButton()?.disabled).toBe(false);
  });
});

function copyButton(): HTMLButtonElement | undefined {
  return (
    (document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="リンクをコピー"]',
    ) as HTMLButtonElement | null) ?? undefined
  );
}

function copyStatus(): HTMLElement | undefined {
  return (
    (document.body.querySelector<HTMLElement>(
      '[role="status"]',
    ) as HTMLElement | null) ?? undefined
  );
}

/**
 * Locks the copy-success live-region update. `ShareLinkRow.onCopy` calls
 * `navigator.clipboard?.writeText(url)` with optional chaining; happy-dom has no
 * `navigator.clipboard`, so the `?.` would short-circuit and the success path
 * never runs. We inject a fake clipboard via a `configurable` defineProperty and
 * restore the original descriptor in `afterEach` (deleting it when there was
 * none), keeping the fake scoped to this describe so the other suites stay
 * clipboard-free.
 */
describe("ShareLinkRow copy success live region (N-005)", () => {
  // Hand-controlled writeText promise (mirrors the #477 pattern above) so the
  // success path stays pending until we explicitly resolve it. This fixes the
  // causality: an immediately-resolved fake could not catch a regression where
  // production stopped awaiting `writeText` before `setCopied(true)`.
  let resolveWrite: () => void = () => {};
  const writeTextMock = vi.fn(
    () =>
      new Promise<void>((res) => {
        resolveWrite = () => res();
      }),
  );
  let originalClipboard: PropertyDescriptor | undefined;

  beforeEach(() => {
    writeTextMock.mockClear();
    resolveWrite = () => {};
    originalClipboard = Object.getOwnPropertyDescriptor(
      globalThis.navigator,
      "clipboard",
    );
    Object.defineProperty(globalThis.navigator, "clipboard", {
      configurable: true,
      writable: true,
      value: { writeText: writeTextMock },
    });
  });

  afterEach(() => {
    if (originalClipboard === undefined) {
      // biome-ignore lint/performance/noDelete: restore the absent-descriptor state happy-dom started with.
      delete (globalThis.navigator as { clipboard?: unknown }).clipboard;
    } else {
      Object.defineProperty(
        globalThis.navigator,
        "clipboard",
        originalClipboard,
      );
    }
  });

  it("updates the live region to コピーしました and calls writeText with the link url", async () => {
    act(() => {
      root.render(
        <PublishSettings
          open={true}
          onClose={() => {}}
          noteId="note-1"
          appUrl="https://example.test"
          publicNoteUrl="https://example.test/u/yk/quiet-interface-memo"
          initial={baseInitial}
        />,
      );
    });

    // Idle: the live region is empty before any copy. `sessionStorage` is
    // cleared per-test so the unsaved-warning `role="status"` never competes
    // with this copy-status `role="status"` span.
    expect(copyStatus()?.textContent).toBe("");

    const copy = copyButton();
    expect(copy).toBeDefined();

    // Click kicks off writeText, but the promise is still pending: the live
    // region must stay empty until the copy actually resolves.
    await act(async () => {
      copy?.click();
      await Promise.resolve();
    });

    expect(writeTextMock).toHaveBeenCalledTimes(1);
    expect(writeTextMock).toHaveBeenCalledWith(activeLink.url);
    // Pending: no success announced yet — this is the causal guard.
    expect(copyStatus()?.textContent).toBe("");

    // Resolve writeText; the `.then` success branch runs and updates the region.
    await act(async () => {
      resolveWrite();
    });

    // Wait on the condition rather than a fixed microtask count, so the test is
    // not coupled to production's `.then` chain depth.
    await vi.waitFor(() => {
      expect(copyStatus()?.textContent).toBe("コピーしました");
    });
  });
});

/**
 * Issue #583 (AC-4 / AC-5 / AC-6): the unsaved-edits warning is read from the
 * cross-route `sessionStorage` flag on the open transition and rendered only
 * when the flag is set. Closing resets it so the next open re-reads fresh.
 */
function unsavedWarning(): HTMLElement | undefined {
  return Array.from(
    document.body.querySelectorAll<HTMLElement>('[role="status"]'),
  ).find((el) => (el.textContent ?? "").includes("未保存の変更があります"));
}

describe("PublishSettings unsaved-edits warning (Issue #583)", () => {
  it("renders the warning with role=status when the note's flag is set", () => {
    window.sessionStorage.setItem("hollow3:note:note-1:dirty", "1");
    act(() => {
      root.render(
        <PublishSettings
          open={true}
          onClose={() => {}}
          noteId="note-1"
          appUrl="https://example.test"
          publicNoteUrl="https://example.test/u/yk/quiet-interface-memo"
          initial={baseInitial}
        />,
      );
    });
    const warning = unsavedWarning();
    expect(warning).toBeDefined();
    expect(warning?.textContent).toContain(
      "公開には最後に保存した版が使われます",
    );
  });

  it("does not render the warning when the flag is unset", () => {
    act(() => {
      root.render(
        <PublishSettings
          open={true}
          onClose={() => {}}
          noteId="note-1"
          appUrl="https://example.test"
          publicNoteUrl="https://example.test/u/yk/quiet-interface-memo"
          initial={baseInitial}
        />,
      );
    });
    expect(unsavedWarning()).toBeUndefined();
  });

  it("does not key off another note's flag", () => {
    window.sessionStorage.setItem("hollow3:note:other:dirty", "1");
    act(() => {
      root.render(
        <PublishSettings
          open={true}
          onClose={() => {}}
          noteId="note-1"
          appUrl="https://example.test"
          publicNoteUrl="https://example.test/u/yk/quiet-interface-memo"
          initial={baseInitial}
        />,
      );
    });
    expect(unsavedWarning()).toBeUndefined();
  });

  it("re-reads the flag on the next open (close resets, then re-read)", () => {
    const Renderer = ({ open }: { open: boolean }) => (
      <PublishSettings
        open={open}
        onClose={() => {}}
        noteId="note-1"
        appUrl="https://example.test"
        publicNoteUrl="https://example.test/u/yk/quiet-interface-memo"
        initial={baseInitial}
      />
    );

    // First open: no flag → no warning.
    act(() => {
      root.render(<Renderer open={true} />);
    });
    expect(unsavedWarning()).toBeUndefined();

    // Close, then the editor sets the flag while the modal is shut.
    act(() => {
      root.render(<Renderer open={false} />);
    });
    window.sessionStorage.setItem("hollow3:note:note-1:dirty", "1");

    // Re-open: the open-transition effect re-reads and the warning appears.
    act(() => {
      root.render(<Renderer open={true} />);
    });
    expect(unsavedWarning()).toBeDefined();
  });
});
