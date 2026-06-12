import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * P31 backlink + related-note sections. Each `serverData` loader is keyed
 * by the runtime argument it receives: the note lookup gets a `LookupArgs`
 * object (`kind`), backlinks get a `noteId` string, related notes get
 * `{ ownerId, excludeNoteId }`. The mock branches on that shape so all
 * three cached loaders resolve from a single `serverData` stub.
 */

const note = {
  id: "01930000-0000-7000-8000-000000000001",
  title: "本文ノート",
  updatedAt: "2026-05-10T00:00:00.000Z",
};
const owner = {
  id: "01930000-0000-7000-8000-0000000000aa",
  username: "tuanemuy",
  displayName: "Tuanemuy",
};

let backlinks: Array<{
  noteId: string;
  title: string;
  slug: string;
  snippet: string | null;
  directorySegments: never[];
}> = [];
let relatedNotes: Array<{
  id: string;
  slug: string;
  title: string;
  tagNames: string[];
  publishedAt: string | null;
}> = [];
let tagNames: string[] = [];

// renderToStaticMarkup output in a node environment has no DOM to query,
// so anchors are extracted structurally (attribute order / class strings /
// escaping must not matter to the assertions).
const decodeEntities = (value: string) =>
  value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");

const extractAnchors = (html: string) =>
  Array.from(html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gs)).map((match) => {
    const attributes = new Map(
      Array.from(match[1].matchAll(/([\w-]+)="([^"]*)"/g)).map(
        ([, name, value]) => [name, decodeEntities(value)],
      ),
    );
    return { attributes, text: match[2] };
  });

const stripAnchors = (html: string) => html.replaceAll(/<a\b.*?<\/a>/gs, "");

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, unknown>;
    children: React.ReactNode;
    className?: string;
  }) => {
    const href = Object.entries(params ?? {}).reduce(
      (acc, [key, value]) => acc.replace(`$${key}`, value),
      to,
    );
    const dataSearch =
      search && Object.keys(search).length > 0
        ? JSON.stringify(search)
        : undefined;
    return (
      <a href={href} className={className} data-search={dataSearch}>
        {children}
      </a>
    );
  },
  notFound: () => new Error("notFound"),
}));

vi.mock("@/core/presentation/serverAction", () => ({
  serverData:
    () =>
    async (arg: unknown): Promise<unknown> => {
      if (typeof arg === "string") {
        // listPublicBacklinks(noteId)
        return { backlinks };
      }
      if (arg && typeof arg === "object" && "ownerId" in arg) {
        // listRelatedPublicNotes({ ownerId, excludeNoteId })
        return { notes: relatedNotes };
      }
      // getPublicNote(args)
      return {
        note,
        renderedContentHtml: "<p>body</p>",
        owner,
        tagNames,
        publishedAt: new Date("2026-05-03T00:00:00.000Z"),
      };
    },
}));

vi.mock("../PublicLayout", () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  avatarInitials: (value: string) => value.slice(0, 1).toUpperCase(),
}));

vi.mock("../../note/content/CodeHighlight", () => ({
  CodeHighlight: () => null,
}));

const { PublicNoteDetail } = await import("../PublicNoteDetail");

describe("PublicNoteDetail backlink / related sections", () => {
  it("renders both sections with links to the public note route", async () => {
    tagNames = ["cloudflare"];
    backlinks = [
      {
        noteId: "01930000-0000-7000-8000-000000000002",
        title: "参照元ノート",
        slug: "ref",
        snippet: null,
        directorySegments: [],
      },
    ];
    relatedNotes = [
      {
        id: "01930000-0000-7000-8000-000000000003",
        slug: "rel",
        title: "関連ノート",
        tagNames: ["react"],
        publishedAt: "2026-04-28T00:00:00.000Z",
      },
    ];

    const element = await PublicNoteDetail({
      args: { kind: "byId", noteId: note.id },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("バックリンク（公開ノート）");
    expect(html).toContain("参照元ノート");
    expect(html).toContain(
      "/notes/public/01930000-0000-7000-8000-000000000002",
    );

    expect(html).toContain("同じ著者の他のノート");
    expect(html).toContain("関連ノート");
    expect(html).toContain("#react");
    expect(html).toContain("2026年4月28日");
    expect(html).toContain(
      "/notes/public/01930000-0000-7000-8000-000000000003",
    );
  });

  it("links inline meta tags to the author's tag-filtered page, keeps bottom-meta tags as spans", async () => {
    tagNames = ["cloudflare", "workers"];
    backlinks = [];
    relatedNotes = [];

    const element = await PublicNoteDetail({
      args: { kind: "byId", noteId: note.id },
    });
    const html = renderToStaticMarkup(element);

    const tagAnchors = extractAnchors(html).filter((anchor) =>
      anchor.attributes.has("data-search"),
    );
    expect(tagAnchors).toHaveLength(tagNames.length);
    for (const tag of tagNames) {
      const anchor = tagAnchors.find((a) => a.text === `#${tag}`);
      expect(anchor).toBeDefined();
      expect(anchor?.attributes.get("href")).toBe("/u/tuanemuy");
      expect(
        JSON.parse(anchor?.attributes.get("data-search") ?? ""),
      ).toStrictEqual({ tags: [tag] });
    }

    // Bottom-meta tags must not be rendered as links: with every anchor
    // removed, each `#tag` text must still survive inside a <span>.
    const withoutAnchors = stripAnchors(html);
    for (const tag of tagNames) {
      expect(withoutAnchors).toMatch(
        new RegExp(`<span\\b[^>]*>#${tag}</span>`),
      );
    }
  });

  it("hides each section when its data is empty", async () => {
    tagNames = ["cloudflare"];
    backlinks = [];
    relatedNotes = [];

    const element = await PublicNoteDetail({
      args: { kind: "byId", noteId: note.id },
    });
    const html = renderToStaticMarkup(element);

    expect(html).not.toContain("バックリンク（公開ノート）");
    expect(html).not.toContain("同じ著者の他のノート");
  });
});
