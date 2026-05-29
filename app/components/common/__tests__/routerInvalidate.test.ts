import { describe, expect, it, vi } from "vitest";
import { appShellInvalidate, routerInvalidate } from "../routerInvalidate";

/**
 * Issue #299 / #300: pins the API contracts for the symmetric pair of
 * AppShell invalidate helpers. The `routerInvalidate` path keeps `_app`
 * out of mutation-driven invalidations, while `appShellInvalidate`
 * targets `_app` exclusively for session-failure and errorComponent
 * retry flows. Both helpers are pure forwarders around
 * `router.invalidate({ filter })`, so the tests inspect the predicate
 * passed to the mock router for each `routeId`.
 */

/**
 * Both `routerInvalidate` and `appShellInvalidate` only inspect
 * `match.routeId`. The minimal `FakeMatch` shape mirrors that contract;
 * if the filter ever starts to read additional fields, the double
 * `as unknown as` casts below MUST be revisited to keep the test honest.
 */
type FakeMatch = { routeId: string };

function makeRouter() {
  const invalidate = vi
    .fn<(opts: { filter?: (m: FakeMatch) => boolean }) => Promise<void>>()
    .mockResolvedValue(undefined);
  return {
    router: { invalidate } as unknown as Parameters<typeof routerInvalidate>[0],
    invalidate,
  };
}

function takeFilter(
  invalidate: ReturnType<typeof makeRouter>["invalidate"],
): (m: FakeMatch) => boolean {
  const call = invalidate.mock.calls.at(-1);
  if (call === undefined) throw new Error("invalidate was not called");
  const filter = call[0]?.filter;
  if (filter === undefined) throw new Error("filter was not passed");
  return filter as unknown as (m: FakeMatch) => boolean;
}

describe("routerInvalidate", () => {
  it("excludes `_app` and lets any other routeId through when no extra filter is given", async () => {
    const { router, invalidate } = makeRouter();
    await routerInvalidate(router);
    const filter = takeFilter(invalidate);
    expect(filter({ routeId: "/_app" })).toBe(false);
    expect(filter({ routeId: "/_app/notes" })).toBe(true);
    expect(filter({ routeId: "/_app/notes/$noteId" })).toBe(true);
    expect(filter({ routeId: "/login" })).toBe(true);
    expect(filter({ routeId: "__root__" })).toBe(true);
  });

  it("AND-composes the additional filter with `_app` exclusion", async () => {
    const { router, invalidate } = makeRouter();
    const onlyNotes = (m: FakeMatch) => m.routeId.startsWith("/_app/notes");
    await routerInvalidate(router, onlyNotes);
    const filter = takeFilter(invalidate);
    // additional filter passes AND not `_app`
    expect(filter({ routeId: "/_app/notes" })).toBe(true);
    expect(filter({ routeId: "/_app/notes/$noteId" })).toBe(true);
    // additional filter rejects
    expect(filter({ routeId: "/_app/tags" })).toBe(false);
    expect(filter({ routeId: "/login" })).toBe(false);
    // `_app` exclusion still wins even if additional filter would pass
    expect(filter({ routeId: "/_app" })).toBe(false);
  });

  it("does not leak `_app` through even when the additional filter would have passed it", async () => {
    const { router, invalidate } = makeRouter();
    const alwaysTrue = () => true;
    await routerInvalidate(router, alwaysTrue);
    const filter = takeFilter(invalidate);
    expect(filter({ routeId: "/_app" })).toBe(false);
    expect(filter({ routeId: "/_app/notes" })).toBe(true);
  });
});

describe("appShellInvalidate", () => {
  it("passes a filter that matches only the exact `/_app` routeId", async () => {
    const { router, invalidate } = makeRouter();
    await appShellInvalidate(router);
    const filter = takeFilter(invalidate);
    expect(filter({ routeId: "/_app" })).toBe(true);
  });

  it("rejects leaf routes whose routeId is a prefix-extension of `/_app`", async () => {
    const { router, invalidate } = makeRouter();
    await appShellInvalidate(router);
    const filter = takeFilter(invalidate);
    // Strict equality — `startsWith` would erroneously include leaves.
    expect(filter({ routeId: "/_app/notes" })).toBe(false);
    expect(filter({ routeId: "/_app/notes/$noteId" })).toBe(false);
    expect(filter({ routeId: "/_app/tags" })).toBe(false);
    expect(filter({ routeId: "/_app/trash" })).toBe(false);
  });

  it("rejects unrelated routes such as the root or auth pages", async () => {
    const { router, invalidate } = makeRouter();
    await appShellInvalidate(router);
    const filter = takeFilter(invalidate);
    expect(filter({ routeId: "__root__" })).toBe(false);
    expect(filter({ routeId: "/login" })).toBe(false);
    expect(filter({ routeId: "/" })).toBe(false);
  });
});
