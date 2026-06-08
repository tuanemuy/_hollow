import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * P32 (#568) search filter drawer. SSR markup assertions cover the filter
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

describe("SearchFilterDrawer markup", () => {
  it("renders the filter button with no badge and no chip row when no filters are active", () => {
    searchState = { q: "outbox" };
    const html = renderToStaticMarkup(<SearchFilterDrawer facets={FACETS} />);
    expect(html).toContain("フィルター");
    // No active filters → no active-chips row and no badge count.
    expect(html).not.toContain("すべて解除");
  });

  it("renders the active-count badge and chips for user / tag / period", () => {
    searchState = {
      q: "outbox",
      username: "tuanemuy",
      tags: ["cloudflare", "ddd"],
      period: "30d",
    };
    const html = renderToStaticMarkup(<SearchFilterDrawer facets={FACETS} />);
    // Badge = 1 (user) + 2 (tags) + 1 (period) = 4.
    expect(html).toContain(">4<");
    expect(html).toContain("@tuanemuy");
    expect(html).toContain("#cloudflare");
    expect(html).toContain("#ddd");
    expect(html).toContain("過去 30 日");
    // Remove affordances are labelled per-chip.
    expect(html).toContain("@tuanemuy を解除");
    expect(html).toContain("#cloudflare を解除");
    expect(html).toContain("過去 30 日 を解除");
    expect(html).toContain("すべて解除");
  });

  it("renders the period radios with their facet counts and the footer total", () => {
    searchState = { q: "outbox", period: "30d" };
    const html = renderToStaticMarkup(<SearchFilterDrawer facets={FACETS} />);
    expect(html).toContain("過去 7 日");
    expect(html).toContain("過去 1 年");
    expect(html).toContain("すべて");
    // Footer reflects the selected period's count (30d → 12).
    expect(html).toContain("12 件を表示");
    // The drawer dialog scaffolding is present.
    expect(html).toContain('role="dialog"');
    expect(html).toContain("ユーザー名を入力…");
    expect(html).toContain("タグ名を入力…");
  });
});
