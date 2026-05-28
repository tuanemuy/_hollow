import type { DirectoryTreeNode } from "@/core/application/directory/view";

/**
 * Flat projection of a `DirectoryTreeNode` forest for depth-prefixed
 * `<select>` pickers. Carries `depth` and `path` so consumers can render
 * indentation / breadcrumb labels without re-walking the tree.
 *
 * SSOT for both the RSC loader (`loadDirectoryTreeFlat`) and the client
 * server-fn (`getDirectoryTreeFn`). Keeping the flatten logic here keeps
 * the two paths structurally identical and keeps `loaders.ts`, where the
 * runtime entry points depend on `serverData(getContainer())`, free of
 * pure helpers that the keeps-its-shape-pure rule wants isolated.
 */
export type FlatDirectory = Readonly<{
  id: string;
  parentId: string | null;
  name: string;
  depth: number;
  path: string;
}>;

export function flattenDirectoryTree(
  tree: ReadonlyArray<DirectoryTreeNode>,
): FlatDirectory[] {
  const flat: FlatDirectory[] = [];
  const walk = (node: DirectoryTreeNode, parentPath: string): void => {
    const path = `${parentPath}/${node.name}`;
    flat.push({
      id: node.id as unknown as string,
      parentId:
        node.parentId === null ? null : (node.parentId as unknown as string),
      name: node.name,
      depth: node.depth,
      path,
    });
    for (const child of node.children) walk(child, path);
  };
  for (const root of tree) walk(root, "");
  return flat;
}
