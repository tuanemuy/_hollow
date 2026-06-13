import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * P32 search filter drawer. SSR markup assertions cover the filter
 * button badge, the active-chip row (user / tag / period chips + remove
 * affordances) and the drawer facet scaffolding. Open/Esc/focus behaviour is
 * client-only and verified via manual test.
 */

let searchState: {
  q?: string;
  username?: string;
  tags?: readonly string[];
  period?: "7d" | "30d" | "1y" | "all";
} = {};

const navigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ navigate }),
  getRouteApi: () => ({
    useSearch: ({ select }: { select: (s: unknown) => unknown }) =>
      select(searchState),
  }),
}));

// Suggestion server fns are never invoked during SSR (no effects run), but
// the import must resolve.
vi.mock("../searchActions", () => ({
  suggestPublicTagsFn: vi.fn(),
  suggestPublicUsersFn: vi.fn(),
}));

const { SearchFilterDrawer } = await import("../SearchFilterDrawer");

const FACETS = [
  { period: "7d" as const, count: 3 },
  { period: "30d" as const, count: 12 },
  { period: "1y" as const, count: 28 },
  { period: "all" as const, count: 31 },
];

const SORT_SLOT = <span data-testid="sort-slot">sort-toggle</span>;

function render(facets: typeof FACETS = FACETS): string {
  return renderToStaticMarkup(
    <SearchFilterDrawer
      facets={facets}
      resultsCount={31}
      countIsLowerBound={false}
    >
      {SORT_SLOT}
    </SearchFilterDrawer>,
  );
}

// Matches the open `<input ... name="search-period" value="X" ... checked ...>`
// tag for a given period value, regardless of attribute order, so the assertion
// does not rely on a fragile substring of「すべて」(which also appears in
// 「すべて解除」/「すべてリセット」).
function isPeriodRadioChecked(html: string, value: string): boolean {
  const tag = /<input\b[^>]*\bname="search-period"[^>]*>/g;
  for (const match of html.matchAll(tag)) {
    const el = match[0];
    if (el.includes(`value="${value}"`)) {
      return /\bchecked\b/.test(el);
    }
  }
  return false;
}

// Walks the SSR markup from the opening `<div class="…FILTER_BAR…">` tag,
// balancing `<div>` / `</div>` to find that element's matching close, and
// returns the index of its closing `</div>`. Lets a test prove containment
// (chip row outside the filter bar) rather than mere document order.
function filterBarCloseIndex(html: string): number {
  const openMatch = html.match(
    /<div class="flex items-center justify-between[^"]*">/,
  );
  if (openMatch?.index === undefined) return -1;
  let cursor = openMatch.index + openMatch[0].length;
  let depth = 1;
  const token = /<div\b[^>]*>|<\/div>/g;
  token.lastIndex = cursor;
  for (let m = token.exec(html); m !== null; m = token.exec(html)) {
    depth += m[0] === "</div>" ? -1 : 1;
    if (depth === 0) return m.index;
    cursor = token.lastIndex;
  }
  return -1;
}

describe("SearchFilterDrawer markup", () => {
  it("renders the filter button with no badge and no chip row when no filters are active", () => {
    searchState = { q: "outbox" };
    const html = render();
    expect(html).toContain("フィルター");
    // No active filters → no active-chips row and no badge count.
    expect(html).toContain('data-testid="sort-slot"');
    expect(html).not.toContain("すべて解除");
  });

  // Every non-default period (7d / 30d / 1y) is shown as a chip, added to the
  // badge count, and checked in the radio group. `all` is covered separately
  // below as the default (no chip / no badge).
  it.each([
    { period: "7d" as const, label: "過去 7 日" },
    { period: "30d" as const, label: "過去 30 日" },
    { period: "1y" as const, label: "過去 1 年" },
  ])("renders the active-count badge, chips and checked radio for period $period", ({
    period,
    label,
  }) => {
    searchState = {
      q: "outbox",
      username: "tuanemuy",
      tags: ["cloudflare", "ddd"],
      period,
    };
    const html = render();
    // Badge = 1 (user) + 2 (tags) + 1 (period) = 4.
    expect(html).toContain(">4<");
    expect(html).toContain("@tuanemuy");
    expect(html).toContain("#cloudflare");
    expect(html).toContain("#ddd");
    // The period chip + its remove affordance use the period's label.
    expect(html).toContain(label);
    expect(html).toContain(`${label} を解除`);
    // The matching radio is checked (and only the matching one).
    expect(isPeriodRadioChecked(html, period)).toBe(true);
    expect(isPeriodRadioChecked(html, "all")).toBe(false);
    // Other per-chip remove affordances are present.
    expect(html).toContain("@tuanemuy を解除");
    expect(html).toContain("#cloudflare を解除");
    expect(html).toContain("すべて解除");
  });

  it("renders the period radios with their facet counts and the footer total", () => {
    searchState = { q: "outbox", period: "30d" };
    const html = render();
    expect(html).toContain("過去 7 日");
    expect(html).toContain("過去 1 年");
    expect(isPeriodRadioChecked(html, "30d")).toBe(true);
    // Footer reflects the selected period's count (30d → 12).
    expect(html).toContain("12 件を表示");
    // The drawer dialog scaffolding is present.
    expect(html).toContain('role="dialog"');
    expect(html).toContain("ユーザー名を入力…");
    expect(html).toContain("タグ名を入力…");
  });

  it("treats period 'all' as the default: no chip, no badge, dropped from active count", () => {
    searchState = { q: "outbox", period: "all" };
    const html = render();
    // No active filters → no badge, no chip row, no clear button.
    expect(html).not.toContain("すべて解除");
    expect(html).not.toContain("を解除");
    // Footer reflects the `all` facet count (31).
    expect(html).toContain("31 件を表示");
    // The「すべて」radio is checked, the others are not.
    expect(isPeriodRadioChecked(html, "all")).toBe(true);
    expect(isPeriodRadioChecked(html, "30d")).toBe(false);
  });

  it("checks the「すべて」radio when no period is set in the URL", () => {
    searchState = { q: "outbox" };
    const html = render();
    expect(isPeriodRadioChecked(html, "all")).toBe(true);
    expect(isPeriodRadioChecked(html, "7d")).toBe(false);
  });

  it("renders the active-chip row as a sibling of the filter bar, not nested inside it", () => {
    searchState = {
      q: "outbox",
      username: "tuanemuy",
      tags: ["cloudflare"],
    };
    const html = render();

    // Anchor 1: the sort slot lives inside FILTER_BAR_RIGHT, which is inside
    // the filter bar — so its close tag must sit before the bar's close.
    const sortSlotIdx = html.indexOf('data-testid="sort-slot"');
    // Anchor 2: the chip row carries border-b border-hairline (ACTIVE_CHIPS)
    // and the「すべて解除」clear button. Find the chip container's opening tag.
    const chipRowMatch = html.match(
      /<div class="[^"]*border-b border-hairline[^"]*">/,
    );
    const chipRowIdx = chipRowMatch?.index ?? -1;
    const clearIdx = html.indexOf("すべて解除");

    // The filter bar's matching close tag, found by balancing <div> nesting.
    const barCloseIdx = filterBarCloseIndex(html);

    expect(sortSlotIdx).toBeGreaterThanOrEqual(0);
    expect(chipRowIdx).toBeGreaterThanOrEqual(0);
    expect(clearIdx).toBeGreaterThanOrEqual(0);
    expect(barCloseIdx).toBeGreaterThanOrEqual(0);

    // Containment proof: the sort slot is a *descendant* of the filter
    // bar (its index is before the bar closes), but the chip row is *not* — its
    // opening tag (and the「すべて解除」button) appear after the bar's closing
    // </div>. Pure document order (clearIdx > sortSlotIdx) could not distinguish
    // a chip row nested at the end of FILTER_BAR_RIGHT from a true sibling; the
    // close-tag boundary does.
    expect(sortSlotIdx).toBeLessThan(barCloseIdx);
    expect(chipRowIdx).toBeGreaterThan(barCloseIdx);
    expect(clearIdx).toBeGreaterThan(barCloseIdx);
  });
});
