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

const {
  updateProfile,
  changeUsername,
  presignMediaUpload,
  finalizeMediaUpload,
  invalidate,
} = vi.hoisted(() => ({
  updateProfile: vi.fn(),
  changeUsername: vi.fn(),
  presignMediaUpload: vi.fn(),
  finalizeMediaUpload: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate }),
}));

// Import the (stubbed) server-fn refs the SUT passes to `useServerFn`, then
// route each to its paired mock by referential equality. `createServerFn` is
// stubbed below so each top-level builder yields a distinct Proxy ref.
const { presignMediaUploadFn, finalizeMediaUploadFn } = await import(
  "@/components/media/actions"
);
const { updateProfileFn, changeUsernameFn } = await import("../action");

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) =>
    useServerFnRouter([
      [updateProfileFn, updateProfile],
      [changeUsernameFn, changeUsername],
      [presignMediaUploadFn, presignMediaUpload],
      [finalizeMediaUploadFn, finalizeMediaUpload],
    ])(fn),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

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
  // Distinct from createdAt so the timestamp test can prove `lastSavedAt`
  // (not some other instant) is what gets rendered.
  lastSavedAt: "2026-03-15T08:30:00.000Z",
  lastUsernameChangedAt: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  updateProfile.mockReset();
  changeUsername.mockReset();
  presignMediaUpload.mockReset();
  finalizeMediaUpload.mockReset();
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

function getDisplayNameInput(): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(
    'input[name="displayName"]',
  );
  if (el === null) throw new Error("displayName input missing");
  return el;
}

function getAvatarFileInput(): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (el === null) throw new Error("avatar file input missing");
  return el;
}

function getResetButton(): HTMLButtonElement {
  const el = Array.from(
    container.querySelectorAll<HTMLButtonElement>("button"),
  ).find((b) => b.textContent === "リセット");
  if (el === undefined) throw new Error("reset button missing");
  return el;
}

// Drive a `change` on a file input by stubbing its `files` list (happy-dom
// doesn't let us assign `input.files` directly via the value setter).
function pickFile(el: HTMLInputElement, file: File) {
  Object.defineProperty(el, "files", {
    configurable: true,
    value: [file],
  });
  act(() => {
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
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

describe("ProfileForm reset", () => {
  it("restores displayName / bio defaults and the bio counter on reset (W-T-001/W-F-001)", () => {
    render("https://app.example.com");
    const displayName = getDisplayNameInput();
    const bio = getBioTextarea();

    // Initial state: defaults from USER.
    expect(displayName.value).toBe("Alice");
    expect(bio.value).toBe("hello");
    expect(container.textContent).toContain("5 / 500");

    // Edit both fields; the counter tracks the bio length.
    setNativeValue(displayName, "Edited Name");
    setNativeValue(bio, "a much longer bio");
    expect(displayName.value).toBe("Edited Name");
    expect(bio.value).toBe("a much longer bio");
    expect(container.textContent).toContain("17 / 500");

    // Reset → back to the initial defaults and counter.
    act(() => {
      getResetButton().click();
    });
    expect(displayName.value).toBe("Alice");
    expect(bio.value).toBe("hello");
    expect(container.textContent).toContain("5 / 500");
  });
});

describe("ProfileForm avatar client validation", () => {
  it("rejects an unsupported MIME without presigning (W-T-003)", () => {
    render("https://app.example.com");
    const gif = new File([new Uint8Array(8)], "a.gif", { type: "image/gif" });
    pickFile(getAvatarFileInput(), gif);

    expect(container.textContent).toContain(
      "PNG または JPEG を選択してください。",
    );
    expect(presignMediaUpload).not.toHaveBeenCalled();
    expect(finalizeMediaUpload).not.toHaveBeenCalled();
  });

  it("rejects a file larger than 5MB without presigning (W-T-003)", () => {
    render("https://app.example.com");
    const tooBig = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", {
      type: "image/png",
    });
    pickFile(getAvatarFileInput(), tooBig);

    expect(container.textContent).toContain("ファイルサイズは5MBまでです。");
    expect(presignMediaUpload).not.toHaveBeenCalled();
    expect(finalizeMediaUpload).not.toHaveBeenCalled();
  });
});

describe("ProfileForm timestamp / cooldown hints (W-T-002)", () => {
  it("renders the last-saved timestamp from lastSavedAt after mount", () => {
    render("https://app.example.com");
    // Build the expected value the same way the component does, so the
    // assertion is locale-independent yet proves `lastSavedAt` is the source
    // (createdAt holds a different instant).
    const expected = new Date(USER.lastSavedAt).toLocaleString("ja-JP", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(container.textContent).toContain(`最終保存: ${expected}`);
  });

  it("renders the next-change hint while the cooldown is active", () => {
    // A change "just now" keeps the 30-day cooldown active, so the hint
    // (gated behind `mounted`) must render after the effect flushes.
    const justChanged = new Date(Date.now()).toISOString();
    render("https://app.example.com", {
      ...USER,
      lastUsernameChangedAt: justChanged,
    });
    expect(container.textContent).toContain("次に変更できるのは");
    expect(container.textContent).toContain("以降です。");
  });

  it("omits the next-change hint when lastUsernameChangedAt is null", () => {
    render("https://app.example.com", {
      ...USER,
      lastUsernameChangedAt: null,
    });
    expect(container.textContent).not.toContain("次に変更できるのは");
  });
});
