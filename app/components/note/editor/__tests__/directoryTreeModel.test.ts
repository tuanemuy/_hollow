import { describe, expect, it } from "vitest";
import type { FlatDirectory } from "../../loaders";
import {
  clampActiveIndex,
  nextActiveIndex,
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
});

describe("clampActiveIndex", () => {
  it("clamps into range and collapses to 0 on empty", () => {
    expect(clampActiveIndex(5, 3)).toBe(2);
    expect(clampActiveIndex(-1, 3)).toBe(0);
    expect(clampActiveIndex(1, 0)).toBe(0);
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
