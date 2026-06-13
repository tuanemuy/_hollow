/**
 * Pure tree / visibility logic for the editor's directory dropdown
 * (`DirectoryTreeSelect`).
 *
 * Split out from the component so the combobox + listbox driving model
 * (the `aria-activedescendant` index must track the *visible* option
 * count exactly) is unit-testable without a DOM. The component owns the
 * `expanded` map and the search query; these helpers turn that plus the
 * `FlatDirectory[]` props into the ordered, flat list of visible options
 * the listbox renders and the arrow keys traverse.
 */

import type { FlatDirectory } from "../loaders";

/**
 * One row the listbox renders. `kind: "directory"` rows mirror a
 * `FlatDirectory`; the synthetic `kind: "create"` row is the trailing
 * "新規ディレクトリを作成…" option, kept in the same flat list so keyboard
 * navigation reaches it and the visible count stays consistent.
 */
export type DirectoryVisibleOption =
  | Readonly<{
      kind: "directory";
      id: string;
      name: string;
      path: string;
      depth: number;
      hasChildren: boolean;
      expanded: boolean;
    }>
  | Readonly<{ kind: "create" }>;

/**
 * Map each directory id to its direct children, in input order. The flat
 * list is assumed to be a pre-order (parent-before-child) projection, so
 * iterating the result in id order reproduces the tree order.
 */
function buildChildrenMap(
  tree: readonly FlatDirectory[],
): Map<string | null, FlatDirectory[]> {
  const children = new Map<string | null, FlatDirectory[]>();
  for (const dir of tree) {
    const list = children.get(dir.parentId);
    if (list === undefined) children.set(dir.parentId, [dir]);
    else list.push(dir);
  }
  return children;
}

/**
 * Resolve the set of directory ids whose `name` or `path` matches the
 * (trimmed, case-insensitive) query, together with every ancestor of a
 * matching node. Returns `null` when the query is empty (meaning "no
 * filter — show everything"). The ancestor ids are used to auto-expand
 * the tree so a deep match is reachable.
 */
export function searchMatchSet(
  tree: readonly FlatDirectory[],
  query: string,
): Readonly<{
  matches: ReadonlySet<string>;
  visible: ReadonlySet<string>;
}> | null {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return null;

  const byId = new Map<string, FlatDirectory>();
  for (const dir of tree) byId.set(dir.id, dir);

  const matches = new Set<string>();
  for (const dir of tree) {
    if (
      dir.name.toLowerCase().includes(trimmed) ||
      dir.path.toLowerCase().includes(trimmed)
    ) {
      matches.add(dir.id);
    }
  }

  // A node is visible when it matches or has a matching descendant; the
  // ancestor chain of every match is therefore visible.
  const visible = new Set<string>();
  for (const id of matches) {
    let cursor: string | null = id;
    while (cursor !== null && !visible.has(cursor)) {
      visible.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
  }

  return { matches, visible };
}

/**
 * Compute the ordered, flat list of options the listbox renders.
 *
 * - With no search query, only nodes whose ancestors are all in
 *   `expanded` appear.
 * - With a search query, only nodes on a match path appear and the
 *   ancestor expansion is implied (so deep matches surface). The
 *   `expanded` map still controls the caret rotation but cannot hide a
 *   node that the search wants visible.
 *
 * The synthetic `create` option is always appended last so it is always
 * reachable, including when the directory list is empty.
 */
export function visibleDirectoryOptions(
  tree: readonly FlatDirectory[],
  expanded: ReadonlySet<string>,
  query: string,
): readonly DirectoryVisibleOption[] {
  const children = buildChildrenMap(tree);
  const search = searchMatchSet(tree, query);
  const out: DirectoryVisibleOption[] = [];

  const walk = (parentId: string | null): void => {
    const list = children.get(parentId);
    if (list === undefined) return;
    for (const dir of list) {
      if (search !== null && !search.visible.has(dir.id)) continue;
      const childList = children.get(dir.id);
      const hasChildren =
        childList !== undefined &&
        (search === null || childList.some((c) => search.visible.has(c.id)));
      const isExpanded =
        search !== null ? search.visible.has(dir.id) : expanded.has(dir.id);
      out.push({
        kind: "directory",
        id: dir.id,
        name: dir.name === "" ? dir.path : dir.name,
        path: dir.path,
        depth: dir.depth,
        hasChildren,
        expanded: isExpanded && hasChildren,
      });
      if (isExpanded) walk(dir.id);
    }
  };

  walk(null);
  out.push({ kind: "create" });
  return out;
}

/**
 * Clamp an active index into `[0, count - 1]`, returning `0` for an empty
 * list. Keeps `aria-activedescendant` pointing at a real option when the
 * visible set shrinks (filter narrows / a branch collapses).
 */
export function clampActiveIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (index < 0) return 0;
  if (index > count - 1) return count - 1;
  return index;
}

/**
 * Next active index for ArrowDown / ArrowUp, wrapping at both ends so the
 * keyboard loop mirrors a native listbox.
 */
export function nextActiveIndex(
  current: number,
  direction: "up" | "down",
  count: number,
): number {
  if (count <= 0) return 0;
  const clamped = clampActiveIndex(current, count);
  if (direction === "down") return (clamped + 1) % count;
  return (clamped - 1 + count) % count;
}
