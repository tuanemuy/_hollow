import { describe, expect, it } from "vitest";
import type { FlatDirectory } from "../../loaders";
import {
  clampActiveIndex,
  nextActiveIndex,
  resolveDirectoryLabel,
  searchMatchSet,
  visibleDirectoryOptions,
} from "../directoryTreeModel";

// Forest:
//   research (0)
//   projects (0)
//     q2 (1)
//     hollow (1)
const tree: FlatDirectory[] = [
  {
    id: "research",
    parentId: null,
    name: "Research",
    depth: 0,
    path: "/Research",
  },
  {
    id: "projects",
    parentId: null,
    name: "Projects",
    depth: 0,
    path: "/Projects",
  },
  {
    id: "q2",
    parentId: "projects",
    name: "Q2 計画",
    depth: 1,
    path: "/Projects/Q2 計画",
  },
  {
    id: "hollow",
    parentId: "projects",
    name: "Hollow",
    depth: 1,
    path: "/Projects/Hollow",
  },
];

function dirIds(
  options: readonly ReturnType<typeof visibleDirectoryOptions>[number][],
): string[] {
  return options
    .filter(
      (o): o is Extract<typeof o, { kind: "directory" }> =>
        o.kind === "directory",
    )
    .map((o) => o.id);
}

describe("visibleDirectoryOptions", () => {
  it("hides children of collapsed nodes and always appends the create option", () => {
    const options = visibleDirectoryOptions(tree, new Set(), "");
    expect(dirIds(options)).toEqual(["research", "projects"]);
    expect(options.at(-1)?.kind).toBe("create");
    const projects = options.find(
      (o) => o.kind === "directory" && o.id === "projects",
    );
    expect(projects?.kind === "directory" && projects.hasChildren).toBe(true);
    expect(projects?.kind === "directory" && projects.expanded).toBe(false);
  });

  it("reveals children when the parent is expanded", () => {
    const options = visibleDirectoryOptions(tree, new Set(["projects"]), "");
    expect(dirIds(options)).toEqual(["research", "projects", "q2", "hollow"]);
  });

  it("auto-expands ancestors of a search match regardless of expanded map", () => {
    const options = visibleDirectoryOptions(tree, new Set(), "hollow");
    expect(dirIds(options)).toEqual(["projects", "hollow"]);
  });

  it("recomputes expanded / hasChildren from the visible set in search mode", () => {
    // Search for the leaf `hollow`: only `projects` (ancestor) and `hollow`
    // surface. `projects` keeps a caret (one visible child) and is forced
    // open; the leaf match has no visible children so its caret is gone.
    const options = visibleDirectoryOptions(tree, new Set(), "hollow");
    const projects = options.find(
      (o) => o.kind === "directory" && o.id === "projects",
    );
    const hollow = options.find(
      (o) => o.kind === "directory" && o.id === "hollow",
    );
    expect(projects?.kind === "directory" && projects.hasChildren).toBe(true);
    expect(projects?.kind === "directory" && projects.expanded).toBe(true);
    expect(hollow?.kind === "directory" && hollow.hasChildren).toBe(false);
    expect(hollow?.kind === "directory" && hollow.expanded).toBe(false);
  });

  it("falls back to the path when a directory name is empty", () => {
    const withRoot: FlatDirectory[] = [
      { id: "root", parentId: null, name: "", depth: 0, path: "/" },
      ...tree.map((d) =>
        d.parentId === null ? { ...d, parentId: "root" } : d,
      ),
    ];
    const options = visibleDirectoryOptions(withRoot, new Set(), "");
    const root = options.find((o) => o.kind === "directory" && o.id === "root");
    expect(root?.kind === "directory" && root.name).toBe("/");
  });

  it("filters on path as well as name", () => {
    const options = visibleDirectoryOptions(tree, new Set(), "Q2");
    expect(dirIds(options)).toEqual(["projects", "q2"]);
  });

  it("returns only the create option when nothing matches", () => {
    const options = visibleDirectoryOptions(tree, new Set(), "zzz");
    expect(dirIds(options)).toEqual([]);
    expect(options).toHaveLength(1);
    expect(options[0]?.kind).toBe("create");
  });
});

describe("searchMatchSet", () => {
  it("returns null for an empty query", () => {
    expect(searchMatchSet(tree, "   ")).toBeNull();
  });

  it("includes the match and its ancestors in the visible set", () => {
    const result = searchMatchSet(tree, "hollow");
    expect(result).not.toBeNull();
    expect([...(result?.matches ?? [])]).toEqual(["hollow"]);
    expect(result?.visible.has("projects")).toBe(true);
    expect(result?.visible.has("hollow")).toBe(true);
  });

  it("matches multiple nodes whose name or path contains the query", () => {
    // `Projects` matches the parent by name and both children by path
    // (`/Projects/...`). The parent is not pulled in as a mere ancestor here
    // — it matches directly — so all three ids are in `matches`, and nothing
    // outside that subtree (research) leaks into `visible`.
    const result = searchMatchSet(tree, "Projects");
    expect(result).not.toBeNull();
    expect([...(result?.matches ?? [])].sort()).toEqual([
      "hollow",
      "projects",
      "q2",
    ]);
    expect(result?.visible.has("research")).toBe(false);
  });
});

describe("clampActiveIndex", () => {
  it("clamps into range and collapses to 0 on empty", () => {
    expect(clampActiveIndex(5, 3)).toBe(2);
    expect(clampActiveIndex(-1, 3)).toBe(0);
    expect(clampActiveIndex(1, 0)).toBe(0);
  });

  it("returns 0 for a negative index on an empty list (guard order)", () => {
    // `count <= 0` must take precedence over the `index < 0` branch so the
    // simultaneous boundary collapses to 0 rather than tripping a reordered
    // guard.
    expect(clampActiveIndex(-1, 0)).toBe(0);
  });
});

describe("nextActiveIndex", () => {
  it("wraps at both ends", () => {
    expect(nextActiveIndex(0, "up", 3)).toBe(2);
    expect(nextActiveIndex(2, "down", 3)).toBe(0);
    expect(nextActiveIndex(0, "down", 3)).toBe(1);
  });

  it("returns 0 for an empty list", () => {
    expect(nextActiveIndex(0, "down", 0)).toBe(0);
  });
});

describe("resolveDirectoryLabel", () => {
  it("returns emptyLabel when nothing is selected and no pending name", () => {
    expect(resolveDirectoryLabel(tree, null, null, "未設定")).toBe("未設定");
    // The two callers differ only in emptyLabel (arch S-007).
    expect(resolveDirectoryLabel(tree, null, null, "ディレクトリを選択")).toBe(
      "ディレクトリを選択",
    );
  });

  it("shows the pending name with a `新規:` prefix for a new directory", () => {
    expect(resolveDirectoryLabel(tree, null, "アイデア", "未設定")).toBe(
      "新規: アイデア",
    );
  });

  it("resolves a selected top-level directory to its full path", () => {
    expect(resolveDirectoryLabel(tree, "projects", null, "未設定")).toBe(
      "/Projects",
    );
  });

  it("resolves a nested directory to its full path", () => {
    expect(resolveDirectoryLabel(tree, "hollow", null, "未設定")).toBe(
      "/Projects/Hollow",
    );
  });

  it("prefers the pending name over a selected directory id", () => {
    expect(resolveDirectoryLabel(tree, "projects", "アイデア", "未設定")).toBe(
      "新規: アイデア",
    );
  });

  it("falls back to emptyLabel for an unknown directory id", () => {
    expect(resolveDirectoryLabel(tree, "missing", null, "未設定")).toBe(
      "未設定",
    );
  });
});
