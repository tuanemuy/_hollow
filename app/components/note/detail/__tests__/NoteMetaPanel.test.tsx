// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaAssetId } from "@/core/application/dto/identity";
import type { BacklinkDTO, NoteId } from "@/core/application/dto/note";

/**
 * Regression guard: the backlink-count footer must show
 * the *total* count (`backlinkCount`), not the length of the preview list
 * (`backlinks`, capped at 5). This test pins that contract so a regression
 * back to `backlinks.length` is caught immediately.
 */

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

const { NoteMetaPanel } = await import("../NoteMetaPanel");

function backlink(n: number): BacklinkDTO {
  return {
    noteId: `note-${n}` as NoteId,
    title: `Backlink ${n}`,
    slug: `backlink-${n}`,
    snippet: null,
  };
}

const baseProps = {
  noteId: "note-self" as NoteId,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  tagNames: [] as readonly string[],
  publishedAt: null,
  status: "active" as const,
  sourceFile: null,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function backlinkSection(): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    'section[aria-label="バックリンク"]',
  );
  if (el === null) throw new Error("backlink section not found");
  return el;
}

describe("NoteMetaPanel backlink count", () => {
  it("shows the total count, not the preview list length", () => {
    // 5 preview items (the cap) but 7 total — the footer must say 7.
    const backlinks = [1, 2, 3, 4, 5].map(backlink);
    act(() => {
      root.render(
        <NoteMetaPanel
          {...baseProps}
          backlinks={backlinks}
          backlinkCount={7}
        />,
      );
    });
    const section = backlinkSection();
    expect(section.textContent).toContain("（7 件）");
    expect(section.textContent).not.toContain("（5 件）");
    expect(section.querySelectorAll("ul > li")).toHaveLength(5);
  });

  it("renders 'なし' and '（0 件）' when there are no backlinks", () => {
    act(() => {
      root.render(
        <NoteMetaPanel {...baseProps} backlinks={[]} backlinkCount={0} />,
      );
    });
    const section = backlinkSection();
    expect(section.textContent).toContain("なし");
    expect(section.textContent).toContain("（0 件）");
    expect(section.querySelectorAll("ul > li")).toHaveLength(0);
  });

  it("renders each backlink title", () => {
    const backlinks = [1, 2, 3].map(backlink);
    act(() => {
      root.render(
        <NoteMetaPanel
          {...baseProps}
          backlinks={backlinks}
          backlinkCount={3}
        />,
      );
    });
    const section = backlinkSection();
    expect(section.textContent).toContain("Backlink 1");
    expect(section.textContent).toContain("Backlink 2");
    expect(section.textContent).toContain("Backlink 3");
  });
});

describe("NoteMetaPanel source file (Issue #452)", () => {
  it("renders nothing for the 元ファイル row when sourceFile is null", () => {
    act(() => {
      root.render(
        <NoteMetaPanel {...baseProps} backlinks={[]} backlinkCount={0} />,
      );
    });
    expect(container.textContent).not.toContain("元ファイル");
  });

  it("renders 閲覧/ダウンロード links pointing at /media/<id> when present", () => {
    act(() => {
      root.render(
        <NoteMetaPanel
          {...baseProps}
          backlinks={[]}
          backlinkCount={0}
          sourceFile={{
            mediaId: "media-src-1" as MediaAssetId,
            originalFileName: "report.pdf",
            mimeType: "application/pdf",
          }}
        />,
      );
    });
    expect(container.textContent).toContain("元ファイル");
    expect(container.textContent).toContain("report.pdf");
    const links = Array.from(
      container.querySelectorAll<HTMLAnchorElement>("a"),
    );
    const view = links.find(
      (a) => a.getAttribute("href") === "/media/media-src-1",
    );
    const download = links.find(
      (a) => a.getAttribute("href") === "/media/media-src-1?download=1",
    );
    expect(view).toBeDefined();
    expect(view?.getAttribute("target")).toBe("_blank");
    expect(view?.getAttribute("rel")).toBe("noopener");
    expect(download).toBeDefined();
  });

  it("falls back to the mime type label when originalFileName is null", () => {
    act(() => {
      root.render(
        <NoteMetaPanel
          {...baseProps}
          backlinks={[]}
          backlinkCount={0}
          sourceFile={{
            mediaId: "media-src-2" as MediaAssetId,
            originalFileName: null,
            mimeType: "image/png",
          }}
        />,
      );
    });
    expect(container.textContent).toContain("image/png");
  });
});
