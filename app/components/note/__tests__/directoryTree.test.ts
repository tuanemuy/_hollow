import { describe, expect, it } from "vitest";
import type { DirectoryTreeNode } from "@/core/application/directory/view";
import {
  directoryAncestorSegments,
  excludeSubtree,
  type FlatDirectory,
  flattenDirectoryTree,
  getDescendantIds,
} from "../directoryTree";

/**
 * Build a minimal `DirectoryTreeNode`. Only the fields the flatten /
 * exclude helpers actually read (`id`/`parentId`/`name`/`depth`/`children`)
 * carry real values; the remaining DTO fields are filled with structurally
 * valid placeholders to satisfy the type without affecting behavior.
 */
function node(partial: {
  id: string;
  parentId: string | null;
  name: string;
  depth: number;
  children?: readonly DirectoryTreeNode[];
}): DirectoryTreeNode {
  return {
    id: partial.id as DirectoryTreeNode["id"],
    ownerId: "owner" as DirectoryTreeNode["ownerId"],
    parentId: partial.parentId as DirectoryTreeNode["parentId"],
    name: partial.name,
    slug: partial.name,
    depth: partial.depth,
    createdAt: "2026-01-01T00:00:00.000Z" as DirectoryTreeNode["createdAt"],
    updatedAt: "2026-01-01T00:00:00.000Z" as DirectoryTreeNode["updatedAt"],
    children: partial.children ?? [],
  };
}

// Implicit root (name="") with a child and a grandchild.
const tree: DirectoryTreeNode[] = [
  node({
    id: "root",
    parentId: null,
    name: "",
    depth: 0,
    children: [
      node({
        id: "work",
        parentId: "root",
        name: "Work",
        depth: 1,
        children: [
          node({ id: "y2024", parentId: "work", name: "2024", depth: 2 }),
        ],
      }),
    ],
  }),
];

describe("flattenDirectoryTree path normalization", () => {
  it("renders the implicit root as `/` and drops its empty segment for children", () => {
    const flat = flattenDirectoryTree(tree);
    const byId = new Map(flat.map((d) => [d.id, d]));

    expect(byId.get("root")?.path).toBe("/");
    expect(byId.get("work")?.path).toBe("/Work");
    expect(byId.get("y2024")?.path).toBe("/Work/2024");
  });

  it("never produces consecutive or trailing slashes", () => {
    const flat = flattenDirectoryTree(tree);
    for (const dir of flat) {
      expect(dir.path).not.toMatch(/\/\//);
      if (dir.path !== "/") {
        expect(dir.path.endsWith("/")).toBe(false);
      }
    }
  });

  it("preserves depth / id / parentId / name unchanged", () => {
    const flat = flattenDirectoryTree(tree);
    const byId = new Map(flat.map((d) => [d.id, d]));

    expect(byId.get("root")).toMatchObject({
      id: "root",
      parentId: null,
      name: "",
      depth: 0,
    });
    expect(byId.get("work")).toMatchObject({
      id: "work",
      parentId: "root",
      name: "Work",
      depth: 1,
    });
    expect(byId.get("y2024")).toMatchObject({
      id: "y2024",
      parentId: "work",
      name: "2024",
      depth: 2,
    });
  });
});

describe("getDescendantIds / excludeSubtree", () => {
  it("collects the target itself plus all descendants", () => {
    const ids = getDescendantIds(tree, "work");
    expect(ids).toEqual(new Set(["work", "y2024"]));
  });

  it("returns an empty set for an absent id", () => {
    expect(getDescendantIds(tree, "missing").size).toBe(0);
  });

  it("drops excluded rows from the flat list", () => {
    const flat = flattenDirectoryTree(tree);
    const excluded = excludeSubtree(flat, getDescendantIds(tree, "work"));
    expect(excluded.map((d) => d.id)).toEqual(["root"]);
  });
});

// Two independent root trees (a forest). Names include whitespace to smoke
// the path join without trimming surprises.
const forest: DirectoryTreeNode[] = [
  node({
    id: "a",
    parentId: null,
    name: "Alpha One",
    depth: 0,
    children: [node({ id: "a1", parentId: "a", name: "child", depth: 1 })],
  }),
  node({
    id: "b",
    parentId: null,
    name: "Beta",
    depth: 0,
    children: [node({ id: "b1", parentId: "b", name: "nested", depth: 1 })],
  }),
];

describe("flattenDirectoryTree / getDescendantIds across a forest", () => {
  it("normalizes each root tree independently", () => {
    const flat = flattenDirectoryTree(forest);
    const byId = new Map(flat.map((d) => [d.id, d]));

    expect(byId.get("a")?.path).toBe("/Alpha One");
    expect(byId.get("a1")?.path).toBe("/Alpha One/child");
    expect(byId.get("b")?.path).toBe("/Beta");
    expect(byId.get("b1")?.path).toBe("/Beta/nested");
  });

  it("resolves ids under the second root (no early break before reaching it)", () => {
    expect(getDescendantIds(forest, "b")).toEqual(new Set(["b", "b1"]));
    expect(getDescendantIds(forest, "b1")).toEqual(new Set(["b1"]));
  });
});

describe("directoryAncestorSegments", () => {
  it("reconstructs root→leaf segments and drops the implicit root", () => {
    const flat = flattenDirectoryTree(tree);
    expect(directoryAncestorSegments(flat, "y2024")).toEqual([
      { id: "work", name: "Work" },
      { id: "y2024", name: "2024" },
    ]);
  });

  it("returns a single segment for a directory directly under root", () => {
    const flat = flattenDirectoryTree(tree);
    expect(directoryAncestorSegments(flat, "work")).toEqual([
      { id: "work", name: "Work" },
    ]);
  });

  it("returns an empty array when the directory is the root itself", () => {
    const flat = flattenDirectoryTree(tree);
    expect(directoryAncestorSegments(flat, "root")).toEqual([]);
  });

  it("returns an empty array when the id is absent from the tree", () => {
    const flat = flattenDirectoryTree(tree);
    expect(directoryAncestorSegments(flat, "missing")).toEqual([]);
  });

  it("stops without looping on a cyclic parentId chain", () => {
    // a → b → a forms a cycle; the visited set must break the walk.
    const cyclic: FlatDirectory[] = [
      { id: "a", parentId: "b", name: "A", depth: 0, path: "/A" },
      { id: "b", parentId: "a", name: "B", depth: 0, path: "/B" },
    ];
    expect(directoryAncestorSegments(cyclic, "a")).toEqual([
      { id: "b", name: "B" },
      { id: "a", name: "A" },
    ]);
  });

  it("stops when an ancestor is missing from the tree", () => {
    // c's parent "gone" is not present — the walk halts after c.
    const broken: FlatDirectory[] = [
      { id: "c", parentId: "gone", name: "C", depth: 2, path: "/C" },
    ];
    expect(directoryAncestorSegments(broken, "c")).toEqual([
      { id: "c", name: "C" },
    ]);
  });
});
