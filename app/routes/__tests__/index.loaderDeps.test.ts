import { describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import type { NoteListSearch } from "@/components/note/schema";

/**
 * Issue #219: the home route excludes `display` from `loaderDeps` so
 * switching list/tile/calendar does not invalidate the loader cache.
 * Pin the contract via the exported `homeLoaderDeps` so a future
 * refactor that reverts to `({ search }) => search` is caught here.
 */

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => serverFnChainStub(),
  createMiddleware: () => serverFnChainStub(),
  useServerFn: useServerFnRouter([], vi.fn()),
}));

vi.mock("@tanstack/react-start/rsc", () => ({
  renderServerComponent: () => null,
}));

// `index.tsx` imports a long tail of side-effect-only action modules to
// register server fns in the RSC manifest. None of them matter for the
// pure-function `homeLoaderDeps`, so stub them all out.
vi.mock("@/components/note/actions", () => ({}));
vi.mock("@/components/directory/actions", () => ({}));
vi.mock("@/components/tag/actions", () => ({}));
vi.mock("@/components/ingestion/actions", () => ({}));
vi.mock("@/components/view/actions", () => ({}));
vi.mock("@/components/media/actions", () => ({}));
vi.mock("@/components/publication/PublishSettings/action", () => ({}));

const { homeLoaderDeps } = await import("../_app/index");

describe("homeLoaderDeps", () => {
  it("strips `display` from the returned deps", () => {
    const search: NoteListSearch = {
      display: "tile",
      page: 1,
      limit: 30,
    };
    const deps = homeLoaderDeps({ search });
    expect(deps).not.toHaveProperty("display");
    expect(deps).toEqual({ page: 1, limit: 30 });
  });

  it("preserves every other search field so loader dedup still tracks them", () => {
    const search: NoteListSearch = {
      display: "calendar",
      page: 2,
      limit: 30,
      q: "alpha",
      directoryId: "d1",
      viewId: "v1",
      visibility: "public",
      referencingNoteId: "n1",
      tagNames: ["t1", "t2"],
      from: "2025-01-01",
      to: "2025-12-31",
    };
    const deps = homeLoaderDeps({ search });
    expect(deps).toEqual({
      page: 2,
      limit: 30,
      q: "alpha",
      directoryId: "d1",
      viewId: "v1",
      visibility: "public",
      referencingNoteId: "n1",
      tagNames: ["t1", "t2"],
      from: "2025-01-01",
      to: "2025-12-31",
    });
  });

  it("is idempotent when `display` is already absent", () => {
    const search: NoteListSearch = { page: 1, limit: 30 };
    expect(homeLoaderDeps({ search })).toEqual({ page: 1, limit: 30 });
  });
});
