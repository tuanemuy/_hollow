import { describe, expect, it } from "vitest";
import type { DirectoryTreeNode } from "@/core/application/dto/directory";
import {
  excludeSubtree,
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
