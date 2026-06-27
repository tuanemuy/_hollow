import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Locks the P32 hero-sub description「このインスタンス全体の公開ノートから横断
 * 検索できます」rendered directly under the hero h1 (mock SSOT), and that the
 * un-searched empty state no longer duplicates that copy.
 */

// `serverData` is called once per module (search + facets); return a union
// payload both consumers can read (`hits`/`nextCursor` for search, `facets`
// for the facet count). The payload is mutable via `mockState` so individual
// tests can seed hits.
const mockState = vi.hoisted(() => ({
  payload: { hits: [], nextCursor: null, facets: [] } as {
    hits: unknown[];
    nextCursor: string | null;
    facets: unknown[];
  },
}));

vi.mock("@/core/presentation/serverAction", () => ({
  serverData: () => async () => mockState.payload,
}));

// `<Link>` needs a RouterProvider; stub it to a plain element so a rendered
// result row (hit) can be asserted without standing up the router. A `span`
// (not an `a`) avoids the `useValidAnchor` lint without affecting the
// text-content assertions this suite makes.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <span className={className}>{children}</span>,
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

beforeEach(() => {
  mockState.payload = { hits: [], nextCursor: null, facets: [] };
});

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

describe("PublicSearch result title highlight (#779)", () => {
  it("element-ises the title's <mark> markers and escapes the user text (AC-2)", async () => {
    mockState.payload = {
      hits: [
        {
          noteId: "00000000-0000-7000-8000-000000000001",
          ownerId: "00000000-0000-7000-9000-000000000001",
          username: "alice",
          // The marker boundaries are trusted (our own `highlight()` call);
          // the inner / surrounding text is user-authored and must be
          // React-escaped, so a literal `<script>` cannot inject HTML.
          title: "安全な<mark><script>alert(1)</script></mark>タイトル",
          snippet: "本文の抜粋",
          tagNames: [],
          score: 1,
          visibility: "public",
          updatedAt: "2026-05-14T09:24:00.000Z",
        },
      ],
      nextCursor: null,
      facets: [],
    };

    const element = await PublicSearch({
      keyword: "script",
      username: null,
      tags: null,
      period: null,
      sort: null,
      cursor: null,
      limit: 20,
    });
    const html = renderToStaticMarkup(element);

    // The marker became a real <mark> element wrapping the matched run.
    expect(html).toContain("<mark");
    expect(html).toContain("</mark>");
    // The user text inside the markers is escaped, not injected as HTML.
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
    // Plain segments around the markers survive.
    expect(html).toContain("安全な");
    expect(html).toContain("タイトル");
  });
});
