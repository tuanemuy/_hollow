// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serverFnChainStub } from "@/components/_test-utils/serverFnMock";
import type { SessionDTO, UserDTO } from "@/core/application/dto/identity";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// Mock each server fn as a distinct spy so assertions can prove the *right*
// fn was wired — not just that *some* fn received the payload. `useServerFn`
// is an identity passthrough, so the SUT calls these spies directly.
const { revokeSessionFn, otherServerFn, invalidate } = vi.hoisted(() => ({
  revokeSessionFn: vi.fn(),
  otherServerFn: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("../action", () => ({
  changePasswordFn: otherServerFn,
  requestEmailChangeFn: otherServerFn,
  revokeAllOtherSessionsFn: otherServerFn,
  revokeSessionFn,
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

const { SecurityForm } = await import("../index");

const USER: UserDTO = {
  id: "user-1",
  username: "alice",
  email: "alice@example.test",
  displayName: "Alice",
  bio: null,
  avatarMediaId: null,
  role: "member",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSavedAt: "2026-01-01T00:00:00.000Z",
  lastUsernameChangedAt: null,
};

const session = (overrides: Partial<SessionDTO> = {}): SessionDTO => ({
  id: "session-1",
  isCurrent: false,
  userAgent: "Mozilla/5.0",
  device: { kind: "unknown", os: null, browser: null, label: null },
  ipAddress: "192.0.2.41",
  createdAt: "2026-05-14T09:24:00.000Z",
  updatedAt: "2026-05-14T09:24:00.000Z",
  expiresAt: "2026-06-13T09:24:00.000Z",
  ...overrides,
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  revokeSessionFn.mockReset();
  otherServerFn.mockReset();
  invalidate.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(sessions: readonly SessionDTO[] = []) {
  act(() => {
    root.render(<SecurityForm user={USER} sessions={sessions} />);
  });
}

describe("SecurityForm new-password strength help", () => {
  it("states the real domain rule (12 chars, 2+ varieties)", () => {
    render();
    expect(container.textContent).toContain(
      "12文字以上。英字・数字・記号のうち2種以上を含めてください。",
    );
  });

  it("wires the help text to the new-password input via aria-describedby", () => {
    render();
    const input = container.querySelector<HTMLInputElement>(
      'input[name="newPassword"]',
    );
    expect(input).not.toBeNull();
    const describedBy = input?.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const help = describedBy
      ? container.querySelector(`#${CSS.escape(describedBy)}`)
      : null;
    expect(help?.textContent).toContain("12文字以上");
    expect(help?.textContent).toContain("2種以上");
  });
});

describe("SecurityForm active sessions list", () => {
  it("shows the 'このセッション' pill and no sign-out button on the current row", () => {
    render([session({ id: "cur", isCurrent: true })]);
    expect(container.textContent).toContain("このセッション");
    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    );
    const signOutButtons = buttons.filter(
      (b) => b.textContent?.trim() === "ログアウト",
    );
    expect(signOutButtons).toHaveLength(0);
  });

  it("renders a sign-out button only for non-current rows", () => {
    render([
      session({ id: "cur", isCurrent: true }),
      session({ id: "other", isCurrent: false }),
    ]);
    const signOutButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).filter((b) => b.textContent?.trim() === "ログアウト");
    expect(signOutButtons).toHaveLength(1);
  });

  it("invokes revokeSessionFn with the row's sessionId when signing out", async () => {
    revokeSessionFn.mockResolvedValue({ ok: true });
    render([session({ id: "other", isCurrent: false })]);
    const button = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((b) => b.textContent?.trim() === "ログアウト");
    expect(button).not.toBeUndefined();
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(revokeSessionFn).toHaveBeenCalledWith({
      data: { sessionId: "other" },
    });
    // The sign-out must go through revokeSessionFn specifically, not any
    // other server fn that happens to accept the same payload.
    expect(otherServerFn).not.toHaveBeenCalled();
  });

  it("renders the parsed device label as the session title when present", () => {
    render([
      session({
        id: "labelled",
        userAgent: "Mozilla/5.0 ...",
        device: {
          kind: "desktop",
          os: "macOS",
          browser: "Safari",
          label: "Safari on macOS",
        },
      }),
    ]);
    expect(container.textContent).toContain("Safari on macOS");
  });

  it("falls back to the raw userAgent when the device has no label", () => {
    render([
      session({
        id: "ua",
        userAgent: "CustomAgent/9.9",
        device: { kind: "unknown", os: null, browser: null, label: null },
      }),
    ]);
    expect(container.textContent).toContain("CustomAgent/9.9");
  });

  it("falls back to 不明な端末 when there is no label and no userAgent", () => {
    render([
      session({
        id: "noua",
        userAgent: null,
        device: { kind: "unknown", os: null, browser: null, label: null },
      }),
    ]);
    expect(container.textContent).toContain("不明な端末");
  });

  it("picks a distinct icon glyph per device kind", () => {
    const glyphFor = (kind: SessionDTO["device"]["kind"]) => {
      const c = document.createElement("div");
      document.body.appendChild(c);
      const r = createRoot(c);
      act(() => {
        r.render(
          <SecurityForm
            user={USER}
            sessions={[
              session({
                id: kind,
                device: { kind, os: null, browser: null, label: null },
              }),
            ]}
          />,
        );
      });
      // The only SVG in a single-session render is the session-row icon.
      const svg = c.querySelector("svg");
      const markup = svg?.innerHTML ?? "";
      act(() => r.unmount());
      c.remove();
      return markup;
    };
    const mobile = glyphFor("mobile");
    const tablet = glyphFor("tablet");
    const desktop = glyphFor("desktop");
    const unknown = glyphFor("unknown");
    // mobile / tablet / desktop are mutually distinct; unknown reuses the
    // generic desktop glyph (no form-factor guess).
    expect(new Set([mobile, tablet, desktop]).size).toBe(3);
    expect(unknown).toBe(desktop);
  });

  it("shows the last-access time as a relative label", () => {
    // updatedAt far in the past → an absolute-date fallback string appears
    // under the 最終アクセス label (relative formatting is exercised in the
    // relativeTime unit test; here we just prove the label is wired).
    render([session({ id: "la", updatedAt: "2020-01-01T00:00:00.000Z" })]);
    expect(container.textContent).toContain("最終アクセス:");
  });
});
