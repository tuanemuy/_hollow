import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/core/application/errors";

/**
 * P31 backlink + related-note sections. Each `serverData` loader is keyed by
 * the usecase module it imports (the `loadModule` first argument of
 * `serverData(loadModule, run)`), identified via its named export, so the note
 * lookup / backlinks / related-notes branches cannot be confused even if a
 * loader's runtime argument shape changes (W-001).
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
// When set, the getPublicNote branch of the serverData stub rejects with it,
// exercising PublicNoteDetail's NotFound → ErrorPage / re-throw behaviour.
let noteError: unknown = null;

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
  useRouter: () => ({ history: { back: () => {} } }),
}));

vi.mock("@/core/presentation/serverAction", () => ({
  // `serverData(loadModule, run)`: identify the loader by the usecase module it
  // imports (the named export it carries), so the note lookup / backlinks /
  // related-notes branches stay distinct regardless of argument shape (W-001).
  serverData:
    (loadModule: () => Promise<Record<string, unknown>>) =>
    async (): Promise<unknown> => {
      const module = await loadModule();
      if ("listPublicBacklinks" in module) {
        return { backlinks };
      }
      if ("listRelatedPublicNotes" in module) {
        return { notes: relatedNotes };
      }
      // getPublicNote
      if (noteError !== null) throw noteError;
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
    noteError = null;
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
    noteError = null;
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
    noteError = null;
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

/**
 * Issue #599: `PublicNoteDetail` is rendered as an RSC via `renderServerComponent`,
 * where `throw notFound()` does not reach the route's `notFoundComponent`. Lock
 * that a missing / unpublished note resolves to `<ErrorPage kind="gone" />`
 * directly (not the generic error boundary), and that unrelated errors re-throw.
 */
describe("PublicNoteDetail notFound handling", () => {
  it("returns ErrorPage kind=gone (not a throw) when the note is NotFound", async () => {
    noteError = new NotFoundError("note_not_published", "Note not published");

    const element = await PublicNoteDetail({
      args: { kind: "byId", noteId: note.id },
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("このノートは公開されていません");
    expect(html).toContain("Error code: 410 Gone");
  });

  it("re-throws errors that are not NotFoundError", async () => {
    noteError = new Error("boom");

    await expect(
      PublicNoteDetail({ args: { kind: "byId", noteId: note.id } }),
    ).rejects.toThrow("boom");
  });
});
