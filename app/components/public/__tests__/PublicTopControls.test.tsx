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
  from?: string;
  to?: string;
} = {};

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate: vi.fn() }),
  getRouteApi: () => ({
    useParams: () => ({ username: "tuanemuy" }),
    useSearch: ({ select }: { select: (s: unknown) => unknown }) =>
      select(searchState),
  }),
}));

const {
  PublicTopControls,
  nextFilterSearch,
  toggleTagSet,
  isTagAddSuppressed,
} = await import("../PublicTopControls");

describe("PublicTopControls URL updaters", () => {
  // Period bounds are tested here for shape/presence, not validation. Invalid
  // date strings (e.g. "2026-13-01", "not-a-date") are validated at the
  // transport boundary (route's validateSearch), not in component tests.
  // This test suite focuses on URL patch generation for valid inputs.

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

  it("nextFilterSearch sets / clears the period bounds and resets the page", () => {
    expect(
      nextFilterSearch({ page: 2 }, { from: "2026-05-01", to: "2026-05-31" }),
    ).toEqual({
      page: undefined,
      from: "2026-05-01",
      to: "2026-05-31",
    });
    expect(nextFilterSearch({}, { from: "2026-05-01", to: undefined })).toEqual(
      {
        page: undefined,
        from: "2026-05-01",
        to: undefined,
      },
    );
    expect(nextFilterSearch({}, { from: undefined, to: "2026-05-31" })).toEqual(
      {
        page: undefined,
        from: undefined,
        to: "2026-05-31",
      },
    );
    expect(
      nextFilterSearch(
        { page: 3, from: "2026-05-01", to: "2026-05-31" },
        { from: undefined, to: undefined },
      ),
    ).toEqual({ page: undefined, from: undefined, to: undefined });
  });

  it("toggleTagSet adds an absent tag and removes a present one", () => {
    expect(toggleTagSet(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleTagSet(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("PublicTopControls markup", () => {
  it("renders すべて + a chip per option and the segmented / sort controls", () => {
    searchState = {};
    const html = renderToStaticMarkup(
      <PublicTopControls
        tagOptions={["cloudflare", "design"]}
        allTags={["cloudflare", "design"]}
      />,
    );
    expect(html).toContain("すべて");
    expect(html).toContain("#cloudflare");
    expect(html).toContain("#design");
    expect(html).toContain("リスト");
    expect(html).toContain("タイル");
    expect(html).toContain("カレンダー");
    expect(html).toContain("公開日順");
    expect(html).toContain("タグを追加");
  });

  it("marks the active tag chip and renders its remove affordance", () => {
    searchState = { tags: ["cloudflare"] };
    const html = renderToStaticMarkup(
      <PublicTopControls
        tagOptions={["cloudflare", "design"]}
        allTags={["cloudflare", "design"]}
      />,
    );
    // The active chip carries data-active (ink fill) and an svg (× icon).
    expect(html).toContain("data-active");
    // A selected-but-absent tag is still shown so it can be removed.
    expect(html).toContain("#cloudflare");
  });

  it("keeps a selected tag visible even when it is not in the options", () => {
    searchState = { tags: ["only-selected"] };
    const html = renderToStaticMarkup(
      <PublicTopControls tagOptions={["other"]} allTags={["other"]} />,
    );
    expect(html).toContain("#only-selected");
  });

  it("marks the active display mode in the segmented control", () => {
    searchState = { display: "tile" };
    const html = renderToStaticMarkup(
      <PublicTopControls tagOptions={[]} allTags={[]} />,
    );
    // role=radio with aria-checked reflects the active tile mode (#660:
    // the display segmented is an APG Radio Group, not a tablist).
    expect(html).toContain('aria-checked="true"');
  });

  it("renders the display segmented as an APG Radio Group (#660): radiogroup / radio / roving tabindex, no tablist", () => {
    // tile is the active mode → its radio is the single tabbable one (tabindex=0),
    // the other two carry tabindex=-1 (roving tabindex). Asserted on the SSR
    // markup so the public-side wiring is pinned without a dynamic harness.
    searchState = { display: "tile" };
    const html = renderToStaticMarkup(
      <PublicTopControls tagOptions={[]} allTags={[]} />,
    );
    // Container role + horizontal orientation (#660).
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-orientation="horizontal"');
    // Three radio buttons, one per display mode.
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    // Roving tabindex: only the active (tile) radio is tabbable.
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2);
    // The APG Tabs markup is fully replaced — no tablist/tab/aria-selected.
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain("aria-selected");
  });

  it("does not merge the master set (allTags) into the chips row", () => {
    // `extra` is only in allTags, never selected → it must NOT surface as a
    // filter-row chip. The chips row is `mergeTagChips(tagOptions, selected)`
    // and stays compact; the master set lives only in the (closed) +タグ picker.
    searchState = {};
    const html = renderToStaticMarkup(
      <PublicTopControls tagOptions={["shown"]} allTags={["shown", "extra"]} />,
    );
    expect(html).toContain("#shown");
    expect(html).not.toContain("#extra");
  });
});

describe("PublicTopControls — +タグ cap suppression (ADR-004)", () => {
  it("suppresses an unselected option once the selected count hits the cap (8)", () => {
    // 8 selected = transport cap; a 9th unselected tag must be suppressed so a
    // toggle cannot push `tags` past `.max(8)` and trip `.catch(undefined)`.
    expect(isTagAddSuppressed(8, false)).toBe(true);
  });

  it("keeps suppressing once the selected count exceeds the cap (9)", () => {
    // Pins the `>=` (not `==`) boundary: suppression must persist above the cap,
    // not only at the exact cap value.
    expect(isTagAddSuppressed(9, false)).toBe(true);
  });

  it("keeps an already-selected option enabled at the cap (toggle-off)", () => {
    expect(isTagAddSuppressed(8, true)).toBe(false);
  });

  it("keeps an already-selected option enabled above the cap (toggle-off)", () => {
    expect(isTagAddSuppressed(9, true)).toBe(false);
  });

  it("does not suppress any option below the cap", () => {
    expect(isTagAddSuppressed(7, false)).toBe(false);
    expect(isTagAddSuppressed(0, false)).toBe(false);
  });

  it("does not suppress a selected option below the cap", () => {
    expect(isTagAddSuppressed(7, true)).toBe(false);
  });
});
