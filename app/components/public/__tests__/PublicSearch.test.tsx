import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * Locks the P32 hero-sub description「このインスタンス全体の公開ノートから横断
 * 検索できます」rendered directly under the hero h1 (mock SSOT), and that the
 * un-searched empty state no longer duplicates that copy.
 */

// `serverData` is called once per module (search + facets); return a union
// payload both consumers can read (`hits`/`nextCursor` for search, `facets`
// for the facet count).
vi.mock("@/core/presentation/serverAction", () => ({
  serverData: () => async () => ({ hits: [], nextCursor: null, facets: [] }),
}));

vi.mock("../PublicLayout", () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  avatarInitials: (value: string) => value.slice(0, 1).toUpperCase(),
}));

// The drawer is a client island that binds `getRouteApi("/search")`; stub it
// so the server-rendered hero/empty-state assertions stay isolated.
vi.mock("../SearchFilterDrawer", () => ({
  SearchFilterDrawer: () => null,
}));

const { PublicSearch } = await import("../PublicSearch");

describe("PublicSearch hero", () => {
  it("renders the hero description under the title", async () => {
    const element = await PublicSearch({
      keyword: "",
      username: null,
      tags: null,
      period: null,
      sort: null,
      cursor: null,
      limit: 20,
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain(
      "このインスタンス全体の公開ノートから横断検索できます",
    );
    // The un-searched empty state shows the「まだ検索していません」guidance
    // and must not duplicate the hero-sub copy.
    expect(html).not.toContain(
      "同じインスタンスの公開ノートを横断検索できます。",
    );
    expect(html).toContain("まだ検索していません");
  });

  it("does not resurrect the old empty-state copy on a no-hit search", async () => {
    // keyword present + zero hits (serverData mock always returns []), so the
    // SEARCH_EMPTY no-results branch renders. The hero-sub stays; the
    // duplicated empty-state copy must not reappear there either.
    const element = await PublicSearch({
      keyword: "存在しない語",
      username: null,
      tags: null,
      period: null,
      sort: null,
      cursor: null,
      limit: 20,
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain(
      "このインスタンス全体の公開ノートから横断検索できます",
    );
    expect(html).not.toContain(
      "同じインスタンスの公開ノートを横断検索できます。",
    );
  });
});
