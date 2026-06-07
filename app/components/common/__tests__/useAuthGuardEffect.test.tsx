// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserDTO } from "@/core/application/dto/identity";

/**
 * Issue #300: pins the mismatch-detection contract of
 * `useAuthGuardEffect`. The hook only fires when the
 * `shell cached user × leaf observed unauthenticated` mismatch holds —
 * fresh unauthenticated visitors (cached null × observed false) must
 * stay no-op so the `_app.loader` is not re-evaluated, preserving the
 * Issue #293 "1 RPC initial, 0 RPC on SPA transitions" guarantee.
 *
 * The hook ultimately delegates to `appShellInvalidate(router)` which
 * is itself covered by `routerInvalidate.test.ts`. Here we only assert
 * the **call** to `router.invalidate`, not the filter shape.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const invalidateMock = vi.fn().mockResolvedValue(undefined);
const routerStub = { invalidate: invalidateMock };

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => routerStub,
}));

const { useAuthGuardEffect } = await import("../useAuthGuardEffect");

function makeUser(id: string): UserDTO {
  return {
    id: id as unknown as UserDTO["id"],
    username: `user_${id}`,
    email: `${id}@example.com`,
    displayName: `User ${id}`,
    bio: null,
    avatarMediaId: null,
    role: "member",
    status: "active",
    createdAt: new Date(0) as unknown as UserDTO["createdAt"],
    lastSavedAt: new Date(0) as unknown as UserDTO["lastSavedAt"],
    lastUsernameChangedAt: null,
  };
}

function Probe(props: {
  leafAuthenticated: boolean;
  shellUserDto: UserDTO | null;
}) {
  useAuthGuardEffect({
    leafAuthenticated: props.leafAuthenticated,
    shellUserDto: props.shellUserDto,
  });
  return null;
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
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

describe("useAuthGuardEffect", () => {
  it("does not fire for a fresh unauthenticated visitor (shell null × leaf false)", () => {
    act(() => {
      root.render(<Probe leafAuthenticated={false} shellUserDto={null} />);
    });
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it("fires when shell cached a user but leaf observed unauthenticated (W-A-001)", () => {
    act(() => {
      root.render(
        <Probe leafAuthenticated={false} shellUserDto={makeUser("u1")} />,
      );
    });
    expect(invalidateMock).toHaveBeenCalledTimes(1);
    // Indirect proof that the hook routes through `appShellInvalidate`
    // (not raw `router.invalidate()`): the filter must accept `/_app`
    // exactly and reject any `/_app/*` leaf. A refactor that bypasses
    // the helper would change the filter shape and trip this assertion.
    const filter = invalidateMock.mock.calls[0]?.[0]?.filter as
      | ((m: { routeId: string }) => boolean)
      | undefined;
    expect(filter?.({ routeId: "/_app" })).toBe(true);
    expect(filter?.({ routeId: "/_app/notes" })).toBe(false);
  });

  it("does not fire on the normal authenticated case (shell user × leaf true)", () => {
    act(() => {
      root.render(
        <Probe leafAuthenticated={true} shellUserDto={makeUser("u1")} />,
      );
    });
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it("does not fire on the theoretically impossible (shell null × leaf true) safety case", () => {
    act(() => {
      root.render(<Probe leafAuthenticated={true} shellUserDto={null} />);
    });
    expect(invalidateMock).not.toHaveBeenCalled();
  });

  it("does not re-fire when re-rendered with the same shellUserDto.id and leafAuthenticated", () => {
    const user = makeUser("u1");
    act(() => {
      root.render(<Probe leafAuthenticated={false} shellUserDto={user} />);
    });
    expect(invalidateMock).toHaveBeenCalledTimes(1);

    // Different identity but same `.id`. The dep array is keyed on the id,
    // so React must skip re-running the effect. This re-render also pins
    // `router` stability: the `useRouter()` mock returns the same
    // `routerStub`, mirroring TanStack Router's singleton invariant. If
    // the router identity ever changed across renders, the dep array would
    // pick it up and re-fire — keeping this assertion guards both axes.
    const sameIdNewObject = makeUser("u1");
    act(() => {
      root.render(
        <Probe leafAuthenticated={false} shellUserDto={sameIdNewObject} />,
      );
    });
    expect(invalidateMock).toHaveBeenCalledTimes(1);
  });

  it("re-fires when shellUserDto.id changes to a different mismatching user", () => {
    act(() => {
      root.render(
        <Probe leafAuthenticated={false} shellUserDto={makeUser("u1")} />,
      );
    });
    expect(invalidateMock).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <Probe leafAuthenticated={false} shellUserDto={makeUser("u2")} />,
      );
    });
    expect(invalidateMock).toHaveBeenCalledTimes(2);
  });
});
