// @vitest-environment happy-dom

import { isValidElement } from "react";
import { describe, expect, it, vi } from "vitest";

/**
 * Issue #732: pins the unauthenticated-branch direction of `HomeRoute`.
 * `selectUnauthenticatedView` maps the auth-mismatch flag returned by
 * `useAuthGuardEffect` to the rendered view. The branch direction is the
 * most important risk (AC-2): a fresh unauthenticated visitor (flag
 * `false`) must always get `LandingPage`, never the neutral placeholder.
 * Mismatch-in-flight (flag `true`) must yield `null` so the
 * unauthenticated UI is not flashed for one frame while `_app`
 * re-evaluates.
 *
 * Mocking `@tanstack/react-router` keeps `route`/`index` module load from
 * constructing real routes, and the `LandingPage` mock lets us identify
 * the chosen element without rendering its full tree.
 */

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    getRouteApi: () => ({ useLoaderData: () => ({ userDto: null }) }),
  };
});

vi.mock("@/components/landing/LandingPage", () => ({
  LandingPage: () => null,
}));

const { selectUnauthenticatedView } = await import("../index");
const { LandingPage } = await import("@/components/landing/LandingPage");

describe("selectUnauthenticatedView", () => {
  it("returns null when an auth mismatch is being resolved (flag true)", () => {
    expect(selectUnauthenticatedView(true)).toBeNull();
  });

  it("returns LandingPage for a fresh unauthenticated visitor (flag false)", () => {
    const view = selectUnauthenticatedView(false);
    expect(isValidElement(view)).toBe(true);
    expect(isValidElement(view) && view.type).toBe(LandingPage);
  });
});
