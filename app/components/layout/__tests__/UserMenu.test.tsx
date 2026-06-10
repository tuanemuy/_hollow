// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import type { UserDTO } from "@/core/application/dto";

/**
 * Issue #467: locks the UserMenu migration onto the shared `<Menu>` primitive.
 * Covers the identity header rendering as a non-MenuItem child (excluded from
 * roving), the menuitems, and the logout-pending `aria-disabled` treatment
 * (ADR-003): while pending the danger (logout) item is aria-disabled, stays
 * focusable in the roving cycle, its click is a no-op, and only the danger
 * item is disabled (設定 stays enabled).
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const logOutMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter([[logOutMock, logOutMock]], logOutMock),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../action", () => ({
  logOutFn: logOutMock,
  loadDirectoryTree: vi.fn(),
}));

const routerInvalidate = vi.fn().mockResolvedValue(undefined);
const routerNavigate = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({
    invalidate: routerInvalidate,
    navigate: routerNavigate,
  }),
}));

const { UserMenu } = await import("../UserMenu");

const user: UserDTO = {
  id: "u1",
  username: "alice",
  email: "alice@example.com",
  displayName: "Alice",
  bio: null,
  avatarMediaId: null,
  role: "member",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSavedAt: "2026-01-01T00:00:00.000Z",
  lastUsernameChangedAt: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  logOutMock.mockReset();
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

function render() {
  act(() => {
    root.render(<UserMenu user={user} />);
  });
}

function trigger(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>(
    'button[aria-label="Alice のメニュー"]',
  ) as HTMLButtonElement;
}

function open() {
  act(() => {
    trigger().click();
  });
}

function menuitems(): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  );
}

describe("UserMenu", () => {
  it("shows identity in the trigger row and a role-only panel header plus 設定 / ログアウト items", () => {
    render();
    // #628: identity (name + email) lives in the always-visible trigger row,
    // not in the menu panel — the menu moved to the sidebar foot.
    const triggerText = trigger().textContent ?? "";
    expect(triggerText).toContain("Alice");
    expect(triggerText).toContain("alice@example.com");

    open();
    const items = menuitems();
    expect(items.map((el) => el.textContent)).toEqual(["設定", "ログアウト"]);
    expect(items[0].getAttribute("tabindex")).toBe("0");

    // The panel header carries only the role label; name / email are not
    // duplicated inside the panel (they are in the trigger row above).
    const panel = container.querySelector<HTMLElement>('[role="menu"]');
    expect(panel?.textContent).toContain("メンバー");
    expect(panel?.textContent ?? "").not.toContain("alice@example.com");
  });

  it("disables only the logout (danger) item while logout is pending and ignores its click", async () => {
    // Hold the logout open so the transition stays pending.
    let resolve: (() => void) | undefined;
    logOutMock.mockReturnValue(
      new Promise<void>((res) => {
        resolve = () => res();
      }),
    );

    render();
    open();
    // Clicking logout starts the pending transition and closes the menu
    // (runAndClose: focus trigger → close → onSelect).
    await act(async () => {
      (menuitems()[1] as HTMLButtonElement).click();
    });
    expect(logOutMock).toHaveBeenCalledTimes(1);
    expect(menuitems()).toHaveLength(0);

    // Reopen the menu while the transition is still pending.
    open();
    const items = menuitems();
    const settings = items[0];
    const logoutItem = items[1];
    // Only the danger item is disabled.
    expect(logoutItem.getAttribute("aria-disabled")).toBe("true");
    expect(settings.getAttribute("aria-disabled")).toBeNull();
    // aria-disabled (not native disabled): stays focusable in the roving cycle.
    expect(logoutItem.hasAttribute("disabled")).toBe(false);

    // A click on the disabled logout item is a no-op (still one call).
    act(() => {
      (logoutItem as HTMLButtonElement).click();
    });
    expect(logOutMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve?.();
      await Promise.resolve();
    });
  });
});
