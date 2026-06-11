import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * P30 public read-only note views. The display mode is read from
 * the URL (`getRouteApi(...).useSearch`); each mode renders links to the
 * public note route `/u/$username/$noteSlug`.
 */

let display: "list" | "tile" | "calendar" = "list";

vi.mock("@tanstack/react-router", () => ({
  getRouteApi: () => ({
    useSearch: ({ select }: { select: (s: unknown) => unknown }) =>
      select({ display }),
  }),
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
    className?: string;
  }) => {
    const href = Object.entries(params ?? {}).reduce(
      (acc, [key, value]) => acc.replace(`$${key}`, value),
      to,
    );
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  },
}));

const { PublicNoteViews } = await import("../PublicNoteViews");

const notes = [
  {
    id: "1",
    slug: "first-note",
    title: "最初のノート",
    excerpt: "本文の抜粋",
    tagNames: ["cloudflare"],
    updatedAt: "2026-03-01T00:00:00.000Z",
    publishedAt: "2026-02-10T00:00:00.000Z",
  },
];

describe("PublicNoteViews", () => {
  it("renders list rows linking to the public note route with the published date", () => {
    display = "list";
    const html = renderToStaticMarkup(
      <PublicNoteViews username="tuanemuy" notes={notes} />,
    );
    expect(html).toContain("最初のノート");
    expect(html).toContain("#cloudflare");
    expect(html).toContain('href="/u/tuanemuy/first-note"');
    // Meta row shows the published date, not the updated date.
    expect(html).toContain("2026年2月10日 公開");
  });

  it("renders the tile grid when display=tile", () => {
    display = "tile";
    const html = renderToStaticMarkup(
      <PublicNoteViews username="tuanemuy" notes={notes} />,
    );
    expect(html).toContain("最初のノート");
    expect(html).toContain('href="/u/tuanemuy/first-note"');
    // Tile cards are <li> wrapped.
    expect(html).toContain("<li>");
  });

  it("renders calendar day buckets when display=calendar", () => {
    display = "calendar";
    const html = renderToStaticMarkup(
      <PublicNoteViews username="tuanemuy" notes={notes} />,
    );
    expect(html).toContain("最初のノート");
    expect(html).toContain('href="/u/tuanemuy/first-note"');
    // A day-group heading is present.
    expect(html).toContain("<h2");
  });

  it("falls back to updatedAt when publishedAt is null (relay lag tolerance)", () => {
    // The implementation defends against relay-lag scenarios where publishedAt
    // may be null by falling back to updatedAt in the noteDate() helper.
    // This test exercises that fallback path.
    display = "list";
    const notesWithNull = [
      {
        ...notes[0],
        publishedAt: null,
        updatedAt: "2026-03-01T00:00:00.000Z",
      },
    ];
    const html = renderToStaticMarkup(
      <PublicNoteViews username="tuanemuy" notes={notesWithNull} />,
    );
    // The meta row should show the updatedAt as a fallback.
    // formatPublishedDate uses the date string directly, so the fallback
    // to updatedAt (2026-03-01) should appear in the HTML.
    expect(html).toContain("2026年3月1日 公開");
  });
});
