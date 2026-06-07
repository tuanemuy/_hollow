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
