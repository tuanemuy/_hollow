import type { DirectoryTreeNode } from "@/core/application/directory/view";

/**
 * Flat projection of a `DirectoryTreeNode` forest for hierarchical
 * directory pickers. Carries `depth` and `path` so consumers can render
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

/**
 * One link in a directory breadcrumb: a directory's id + display name.
 *
 * SSOT for the breadcrumb segment shape shared by `NoteBreadcrumb` (detail,
 * P11), `DirectoryBreadcrumb` (list, P10) and `directoryAncestorSegments`.
 * Lives here — the neutral pure-helper module both breadcrumbs depend on —
 * so neither detail nor list owns the type.
 */
export type BreadcrumbSegment = Readonly<{ id: string; name: string }>;

/**
 * Reconstruct the root→current breadcrumb path for `directoryId` from the
 * already-loaded flat tree (no extra I/O): walk `parentId` links up to the
 * root, then reverse into root→leaf order.
 *
 * The implicit root (`name === ""`) is dropped from the result — passing the
 * root directory id to the `directoryId` filter is intentionally avoided (see
 * Issue #356 ADR-002). This `name === ""` filter is a defensive second layer:
 * callers (the directory tree links) already never pass the root id, but the
 * helper guards too so a future caller cannot regress root into the path.
 *
 * Returns an empty array when `directoryId` is not present in the tree (e.g.
 * just deleted) — the caller (`FilterBar`) then renders a generic fallback
 * instead of a breadcrumb. A `visited` set guards against cyclic `parentId`
 * links, and the walk stops if an ancestor is missing from the tree.
 */
export function directoryAncestorSegments(
  flat: ReadonlyArray<FlatDirectory>,
  directoryId: string,
): readonly BreadcrumbSegment[] {
  const byId = new Map(flat.map((d) => [d.id, d]));
  const chain: FlatDirectory[] = [];
  const visited = new Set<string>();
  let current: FlatDirectory | undefined = byId.get(directoryId);
  while (current !== undefined && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current);
    current =
      current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return chain
    .reverse()
    .filter((d) => d.name !== "")
    .map((d) => ({ id: d.id, name: d.name }));
}

export function flattenDirectoryTree(
  tree: ReadonlyArray<DirectoryTreeNode>,
): FlatDirectory[] {
  const flat: FlatDirectory[] = [];
  const walk = (
    node: DirectoryTreeNode,
    ancestors: readonly string[],
  ): void => {
    // root carries name="" — drop the empty segment so its children render
    // as `/Documents` rather than `//Documents`. root itself stays `/`.
    const segments = node.name === "" ? ancestors : [...ancestors, node.name];
    const path = `/${segments.join("/")}`;
    flat.push({
      id: node.id,
      parentId: node.parentId === null ? null : node.parentId,
      name: node.name,
      depth: node.depth,
      path,
    });
    for (const child of node.children) walk(child, segments);
  };
  for (const root of tree) walk(root, []);
  return flat;
}

/**
 * Collect the set of ids covering `targetId` itself and every descendant
 * underneath it. DFS-walks the forest until the node is found, then walks
 * the subtree to gather ids. Returns an empty Set when `targetId` is not
 * present in the forest. Pure function — used by `MoveDirectoryDialog` to
 * exclude the moving subtree from the destination picker so users cannot
 * select a cyclic target. The backend `assertNotCyclicMove` is the source
 * of truth; this helper only mirrors the same invariant in the UI for UX.
 */
export function getDescendantIds(
  tree: ReadonlyArray<DirectoryTreeNode>,
  targetId: string,
): Set<string> {
  const ids = new Set<string>();
  const collect = (node: DirectoryTreeNode): void => {
    ids.add(node.id);
    for (const child of node.children) collect(child);
  };
  const find = (node: DirectoryTreeNode): boolean => {
    if (node.id === targetId) {
      collect(node);
      return true;
    }
    for (const child of node.children) {
      if (find(child)) return true;
    }
    return false;
  };
  for (const root of tree) {
    if (find(root)) break;
  }
  return ids;
}

/**
 * Filter a flat directory list, dropping any row whose `id` appears in
 * `excludeIds`. Pure function — pairs with `getDescendantIds` to build a
 * cycle-safe destination list for `MoveDirectoryDialog`.
 */
export function excludeSubtree(
  flat: ReadonlyArray<FlatDirectory>,
  excludeIds: ReadonlySet<string>,
): FlatDirectory[] {
  return flat.filter((dir) => !excludeIds.has(dir.id));
}
