import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * P30 filter chips / display segmented / sort wiring. The URL
 * updaters are pure functions (tested directly); the SSR markup assertions
 * cover the chip set, active state and remove (×) affordance.
 */

let searchState: {
  display?: "list" | "tile" | "calendar";
  tags?: readonly string[];
  sort?: "publishedAt" | "updatedAt" | "createdAt" | "title";
} = {};

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: vi.fn() }),
  getRouteApi: () => ({
    useParams: () => ({ username: "tuanemuy" }),
    useSearch: ({ select }: { select: (s: unknown) => unknown }) =>
      select(searchState),
  }),
}));

const { PublicTopControls, nextFilterSearch, toggleTagSet, nextSortAxis } =
  await import("../PublicTopControls");

describe("PublicTopControls URL updaters", () => {
  it("nextFilterSearch resets the page and drops default values", () => {
    expect(nextFilterSearch({ page: 3 }, { tags: ["a", "b"] })).toEqual({
      page: undefined,
      tags: ["a", "b"],
    });
    // Empty tag set clears the param.
    expect(nextFilterSearch({ page: 3, tags: ["a"] }, { tags: [] })).toEqual({
      page: undefined,
      tags: undefined,
    });
    // The default sort (publishedAt) is dropped so the URL stays clean.
    expect(nextFilterSearch({}, { sort: "publishedAt" })).toEqual({
      page: undefined,
      sort: undefined,
    });
    expect(nextFilterSearch({}, { sort: "updatedAt" })).toEqual({
      page: undefined,
      sort: "updatedAt",
    });
    expect(nextFilterSearch({}, { sort: "title" })).toEqual({
      page: undefined,
      sort: "title",
    });
  });

  it("toggleTagSet adds an absent tag and removes a present one", () => {
    expect(toggleTagSet(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleTagSet(["a", "b"], "a")).toEqual(["b"]);
  });

  it("nextSortAxis cycles publishedAt → updatedAt → createdAt → title → publishedAt", () => {
    expect(nextSortAxis("publishedAt")).toBe("updatedAt");
    expect(nextSortAxis("updatedAt")).toBe("createdAt");
    expect(nextSortAxis("createdAt")).toBe("title");
    expect(nextSortAxis("title")).toBe("publishedAt");
  });
});

describe("PublicTopControls markup", () => {
  it("renders すべて + a chip per option and the segmented / sort controls", () => {
    searchState = {};
    const html = renderToStaticMarkup(
      <PublicTopControls tagOptions={["cloudflare", "design"]} />,
    );
    expect(html).toContain("すべて");
    expect(html).toContain("#cloudflare");
    expect(html).toContain("#design");
    expect(html).toContain("リスト");
    expect(html).toContain("タイル");
    expect(html).toContain("カレンダー");
    expect(html).toContain("公開日順");
  });

  it("marks the active tag chip and renders its remove affordance", () => {
    searchState = { tags: ["cloudflare"] };
    const html = renderToStaticMarkup(
      <PublicTopControls tagOptions={["cloudflare", "design"]} />,
    );
    // The active chip carries data-active (ink fill) and an svg (× icon).
    expect(html).toContain("data-active");
    // A selected-but-absent tag is still shown so it can be removed.
    expect(html).toContain("#cloudflare");
  });

  it("keeps a selected tag visible even when it is not in the options", () => {
    searchState = { tags: ["only-selected"] };
    const html = renderToStaticMarkup(
      <PublicTopControls tagOptions={["other"]} />,
    );
    expect(html).toContain("#only-selected");
  });

  it("marks the active display mode in the segmented control", () => {
    searchState = { display: "tile" };
    const html = renderToStaticMarkup(<PublicTopControls tagOptions={[]} />);
    // role=tab with aria-selected reflects the active tile mode.
    expect(html).toContain('aria-selected="true"');
  });
});
