// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import type { UserDTO } from "@/core/application/dto/identity";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { updateProfile, changeUsername, invalidate } = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  changeUsername: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate }),
}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter([], updateProfile),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

// `useServerFn` is dispatched twice (updateProfile / changeUsername); the
// identity-router stub above returns the same fallback for both, which is fine
// because the tests below do not submit either form.
const { ProfileForm } = await import("../index");

const USER: UserDTO = {
  id: "user-1",
  username: "alice",
  email: "alice@example.test",
  displayName: "Alice",
  bio: "hello",
  avatarMediaId: null,
  role: "member",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  updateProfile.mockReset();
  changeUsername.mockReset();
  invalidate.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function render(appUrl: string, user: UserDTO = USER) {
  act(() => {
    root.render(<ProfileForm user={user} appUrl={appUrl} />);
  });
}

function getBioTextarea(): HTMLTextAreaElement {
  const el = container.querySelector<HTMLTextAreaElement>(
    'textarea[name="bio"]',
  );
  if (el === null) throw new Error("bio textarea missing");
  return el;
}

function getUsernameInput(): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(
    'input[name="newUsername"]',
  );
  if (el === null) throw new Error("username input missing");
  return el;
}

function setNativeValue(el: HTMLTextAreaElement | HTMLInputElement, v: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  act(() => {
    setter?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("ProfileForm bio character counter", () => {
  it("shows the initial count over the real domain max (500)", () => {
    render("https://app.example.com");
    // Initial bio "hello" → 5 / 500.
    expect(container.textContent).toContain("5 / 500");
    // The mock placeholder max (160) must never be shown.
    expect(container.textContent).not.toContain("/ 160");
  });

  it("updates the count on input", () => {
    render("https://app.example.com");
    setNativeValue(getBioTextarea(), "abc");
    expect(container.textContent).toContain("3 / 500");
  });

  it("shows 0 / 500 when bio is null (the `?? 0` fallback)", () => {
    render("https://app.example.com", { ...USER, bio: null });
    expect(container.textContent).toContain("0 / 500");
  });
});

describe("ProfileForm username URL preview", () => {
  it("builds {appUrl}/u/<username> using the configured appUrl", () => {
    render("https://app.example.com");
    // Falls back to the current username before typing.
    expect(container.textContent).toContain("https://app.example.com/u/alice");
    setNativeValue(getUsernameInput(), "bob");
    expect(container.textContent).toContain("https://app.example.com/u/bob");
  });

  it("normalizes a trailing slash in appUrl (no double slash)", () => {
    render("https://app.example.com/");
    expect(container.textContent).toContain("https://app.example.com/u/alice");
    expect(container.textContent).not.toContain("/u//");
  });

  it("falls back to a relative /u/ when appUrl is empty (no dummy host)", () => {
    render("");
    setNativeValue(getUsernameInput(), "bob");
    expect(container.textContent).toContain("/u/bob");
    // No fabricated host such as the mock's hollow.example placeholder.
    expect(container.textContent).not.toContain("hollow.example");
  });
});

describe("ProfileForm username rate-limit help", () => {
  it("states the real 30-day cooldown (not the mock's 90 days)", () => {
    render("https://app.example.com");
    expect(container.textContent).toContain(
      "ユーザー名は30日に1回まで変更できます。",
    );
    expect(container.textContent).not.toContain("90日");
  });

  it("wires the rate-limit help to the new-username input via aria-describedby", () => {
    render("https://app.example.com");
    const input = getUsernameInput();
    const describedBy = input.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const help = describedBy
      ? container.querySelector(`#${CSS.escape(describedBy)}`)
      : null;
    expect(help?.textContent).toContain(
      "ユーザー名は30日に1回まで変更できます。",
    );
  });
});
