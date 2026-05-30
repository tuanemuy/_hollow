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
  getRequest: vi.fn<() => { method: string }>(),
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
