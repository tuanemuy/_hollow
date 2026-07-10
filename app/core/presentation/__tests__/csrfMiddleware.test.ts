import { beforeEach, describe, expect, it, vi } from "vitest";

// `createMiddleware(...).server(fn)` is called at module top-level by both
// `csrfMiddleware` and `errorResponseMiddleware`. Capture the `fn` passed to
// `.server(...)` so the middleware body can be invoked directly in tests with
// a fake `{ next }`. Each module's captured server callback is keyed by the
// order modules are imported below.
const serverCallbacks: Array<(opts: { next: () => unknown }) => unknown> = [];
vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({
    server: (fn: (opts: { next: () => unknown }) => unknown) => {
      serverCallbacks.push(fn);
      return { _serverFn: fn };
    },
  }),
}));

const mocks = vi.hoisted(() => ({
  getRequest: vi.fn<() => { method: string; url?: string }>(),
  getRequestHeader: vi.fn<(name: string) => string | undefined>(),
  setResponseStatus: vi.fn<(status: number) => void>(),
  getContainer: vi.fn<() => Promise<{ config: { appUrl: string } }>>(),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequest: mocks.getRequest,
  getRequestHeader: mocks.getRequestHeader,
  setResponseStatus: mocks.setResponseStatus,
}));

vi.mock("@/core/application/di/containerStore", () => ({
  getContainer: mocks.getContainer,
}));

const APP_URL = "https://app.example.com";

// Importing each module runs its top-level `createMiddleware(...).server(fn)`,
// which pushes `fn` onto `serverCallbacks`. We invoke those captured bodies
// directly rather than the exported middleware objects.
const { isSameOrigin } = await import("../csrfMiddleware");
await import("../errorResponseMiddleware");
const { AppServerError, httpStatusFor } = await import("../errorResponse");

// The `.server(...)` body each middleware registered, in import order above.
const csrfServer = serverCallbacks[0];
const errorResponseServer = serverCallbacks[1];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getContainer.mockResolvedValue({ config: { appUrl: APP_URL } });
});

describe("isSameOrigin", () => {
  it("returns true for an identical Origin value", () => {
    expect(isSameOrigin(APP_URL, APP_URL)).toBe(true);
  });

  it("returns false for a different origin (host)", () => {
    expect(isSameOrigin("https://evil.example.com", APP_URL)).toBe(false);
  });

  it("returns false for a different scheme", () => {
    expect(isSameOrigin("http://app.example.com", APP_URL)).toBe(false);
  });

  it("returns false for a different port", () => {
    expect(isSameOrigin("https://app.example.com:8443", APP_URL)).toBe(false);
  });

  it("treats an explicit default port as equal to the implicit one", () => {
    expect(isSameOrigin("https://app.example.com:443", APP_URL)).toBe(true);
  });

  it("matches when the app URL carries an explicit non-default port", () => {
    expect(
      isSameOrigin("http://localhost:8787", "http://localhost:8787/"),
    ).toBe(true);
  });

  it("returns false for the literal string 'null' (sandboxed/opaque origin)", () => {
    expect(isSameOrigin("null", APP_URL)).toBe(false);
  });

  it("matches when the candidate is a full Referer URL with a path", () => {
    expect(isSameOrigin("https://app.example.com/admin/users", APP_URL)).toBe(
      true,
    );
  });

  it("matches a trailing-slash app URL by origin", () => {
    expect(
      isSameOrigin("https://app.example.com", "https://app.example.com/"),
    ).toBe(true);
  });

  it("returns false when the candidate is undefined", () => {
    expect(isSameOrigin(undefined, APP_URL)).toBe(false);
  });

  it("returns false for an unparsable URL string", () => {
    expect(isSameOrigin("not a url", APP_URL)).toBe(false);
  });
});

describe("csrfMiddleware body", () => {
  it("skips verification for safe methods (GET) and calls next()", async () => {
    mocks.getRequest.mockReturnValue({ method: "GET" });
    const next = vi.fn().mockResolvedValue("ok");

    const result = await csrfServer({ next });

    expect(result).toBe("ok");
    expect(next).toHaveBeenCalledTimes(1);
    expect(mocks.getRequestHeader).not.toHaveBeenCalled();
    expect(mocks.getContainer).not.toHaveBeenCalled();
  });

  it("reaches next() on a same-origin POST (Origin header)", async () => {
    mocks.getRequest.mockReturnValue({ method: "POST" });
    mocks.getRequestHeader.mockImplementation((name) =>
      name === "origin" ? APP_URL : undefined,
    );
    const next = vi.fn().mockResolvedValue("ok");

    const result = await csrfServer({ next });

    expect(result).toBe("ok");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("accepts a request whose Origin matches the served origin but not APP_URL (dev on a different port)", async () => {
    // APP_URL is pinned to prod (https://app.example.com), but the app is
    // served locally on http://localhost:3001 by vite. The browser Origin
    // matches where it was served, so CSRF must pass.
    mocks.getRequest.mockReturnValue({
      method: "POST",
      url: "http://localhost:3001/_serverFn/x",
    });
    mocks.getRequestHeader.mockImplementation((name) =>
      name === "origin" ? "http://localhost:3001" : undefined,
    );
    const next = vi.fn().mockResolvedValue("ok");

    await expect(csrfServer({ next })).resolves.toBe("ok");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects a cross-origin POST even when the request is served on a dev port", async () => {
    // Served on localhost:3001, but the Origin is an attacker site. The
    // served origin cannot be forged, so this must still be rejected.
    mocks.getRequest.mockReturnValue({
      method: "POST",
      url: "http://localhost:3001/_serverFn/x",
    });
    mocks.getRequestHeader.mockImplementation((name) =>
      name === "origin" ? "http://localhost:6006" : undefined,
    );
    const next = vi.fn();

    await expect(csrfServer({ next })).rejects.toMatchObject({
      name: "ForbiddenError",
      code: "FORBIDDEN_CROSS_ORIGIN",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("accepts a Referer that matches the served origin when Origin is absent (dev port)", async () => {
    mocks.getRequest.mockReturnValue({
      method: "POST",
      url: "http://localhost:3001/_serverFn/x",
    });
    mocks.getRequestHeader.mockImplementation((name) =>
      name === "referer" ? "http://localhost:3001/admin/design" : undefined,
    );
    const next = vi.fn().mockResolvedValue("ok");

    await expect(csrfServer({ next })).resolves.toBe("ok");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("falls back to Referer when Origin is absent and matches", async () => {
    mocks.getRequest.mockReturnValue({ method: "POST" });
    mocks.getRequestHeader.mockImplementation((name) =>
      name === "referer" ? `${APP_URL}/admin/settings` : undefined,
    );
    const next = vi.fn().mockResolvedValue("ok");

    await expect(csrfServer({ next })).resolves.toBe("ok");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("throws ForbiddenError on a cross-origin POST", async () => {
    mocks.getRequest.mockReturnValue({ method: "POST" });
    mocks.getRequestHeader.mockImplementation((name) =>
      name === "origin" ? "https://evil.example.com" : undefined,
    );
    const next = vi.fn();

    await expect(csrfServer({ next })).rejects.toMatchObject({
      name: "ForbiddenError",
      code: "FORBIDDEN_CROSS_ORIGIN",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects a forged Origin even when Referer is same-origin (Origin is authoritative)", async () => {
    mocks.getRequest.mockReturnValue({ method: "POST" });
    mocks.getRequestHeader.mockImplementation((name) => {
      if (name === "origin") return "https://evil.example.com";
      if (name === "referer") return `${APP_URL}/admin/users`;
      return undefined;
    });
    const next = vi.fn();

    await expect(csrfServer({ next })).rejects.toMatchObject({
      name: "ForbiddenError",
      code: "FORBIDDEN_CROSS_ORIGIN",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("falls back to Referer when Origin is an empty string", async () => {
    mocks.getRequest.mockReturnValue({ method: "POST" });
    mocks.getRequestHeader.mockImplementation((name) => {
      if (name === "origin") return "";
      if (name === "referer") return `${APP_URL}/admin/settings`;
      return undefined;
    });
    const next = vi.fn().mockResolvedValue("ok");

    await expect(csrfServer({ next })).resolves.toBe("ok");
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("throws ForbiddenError when both Origin and Referer are absent", async () => {
    mocks.getRequest.mockReturnValue({ method: "POST" });
    mocks.getRequestHeader.mockReturnValue(undefined);
    const next = vi.fn();

    await expect(csrfServer({ next })).rejects.toMatchObject({
      name: "ForbiddenError",
    });
    expect(next).not.toHaveBeenCalled();
  });
});

// [P-001] regression guard: errorResponseMiddleware must wrap csrfMiddleware
// (it is first in the `.middleware([...])` array). Chain them in the real
// array order — errorResponse's `next` runs csrf's body — and assert a
// cross-origin POST surfaces as a serialized 403, not a bare ForbiddenError.
//
// Scope: this fixes the *semantics* — "when errorResponse wraps csrf, a
// cross-origin throw becomes a serialized 403". It does NOT read the actual
// `.middleware([...])` arrays in the admin action.ts files, so a future edit
// that reorders one of those arrays would not be caught here. The arrays are
// kept correct by review + the convention that errorResponseMiddleware leads.
describe("errorResponseMiddleware + csrfMiddleware chain (array order)", () => {
  it("turns a cross-origin POST into a serialized 403", async () => {
    mocks.getRequest.mockReturnValue({ method: "POST" });
    mocks.getRequestHeader.mockImplementation((name) =>
      name === "origin" ? "https://evil.example.com" : undefined,
    );

    const innerHandler = vi.fn().mockResolvedValue("should-not-run");
    // errorResponse.next() === run csrf body, whose next() === the handler.
    const chained = () =>
      errorResponseServer({ next: () => csrfServer({ next: innerHandler }) });

    await expect(chained()).rejects.toBeInstanceOf(AppServerError);
    expect(innerHandler).not.toHaveBeenCalled();

    let serialized: { kind: string; message: string } | null = null;
    try {
      await chained();
    } catch (e) {
      if (e instanceof AppServerError) serialized = e.serialized;
    }
    expect(serialized?.kind).toBe("forbidden");
    expect(serialized && httpStatusFor(serialized as never)).toBe(403);
    expect(mocks.setResponseStatus).toHaveBeenCalledWith(403);
  });

  it("lets a same-origin POST through to the handler", async () => {
    mocks.getRequest.mockReturnValue({ method: "POST" });
    mocks.getRequestHeader.mockImplementation((name) =>
      name === "origin" ? APP_URL : undefined,
    );

    const innerHandler = vi.fn().mockResolvedValue("handler-result");
    const result = await errorResponseServer({
      next: () => csrfServer({ next: innerHandler }),
    });

    expect(result).toBe("handler-result");
    expect(innerHandler).toHaveBeenCalledTimes(1);
  });
});
