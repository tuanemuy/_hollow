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
  },
];

describe("PublicNoteViews", () => {
  it("renders list rows linking to the public note route", () => {
    display = "list";
    const html = renderToStaticMarkup(
      <PublicNoteViews username="tuanemuy" notes={notes} />,
    );
    expect(html).toContain("最初のノート");
    expect(html).toContain("#cloudflare");
    expect(html).toContain('href="/u/tuanemuy/first-note"');
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
});
