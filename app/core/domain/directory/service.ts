import type { IdGenerator } from "@/core/application/ports/idGenerator";
import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteRepository } from "@/core/domain/note/ports/noteRepository";
import type { NoteId } from "@/core/domain/note/valueObject";
import { type ChildDirectory, Directory, type RootDirectory } from "./entity";
import { DirectoryErrorCode } from "./errorCode";
import type { DirectoryRepository } from "./ports/directoryRepository";
import {
  type DirectoryId,
  type DirectoryName,
  DirectoryPath,
  type DirectorySlug,
} from "./valueObject";

/**
 * Domain service for hierarchy-spanning invariants.
 *
 * Each method is a static helper rather than a class so the service
 * stays pure-functional and trivially mockable. Aggregate-level
 * invariants (depth, ownership of a single node) live on the entity;
 * cross-aggregate / cross-tree invariants land here.
 */
export const DirectoryService = {
  /**
   * Reject creating / renaming / moving a directory into a parent that
   * already holds a sibling with the same case-insensitive name. The
   * lookup is delegated to the repository because the existing siblings
   * are not part of any aggregate the caller holds.
   *
   * `exceptId` is non-null for rename / move flows so the node being
   * mutated does not match itself.
   */
  async assertSiblingNameUnique(
    parentId: DirectoryId | null,
    ownerId: UserId,
    name: DirectoryName,
    exceptId: DirectoryId | null,
    repo: DirectoryRepository,
  ): Promise<void> {
    const existing = await repo.findBySiblingName(parentId, ownerId, name);
    if (existing === null) {
      return;
    }
    if (exceptId !== null && existing.id === exceptId) {
      return;
    }
    throw new BusinessRuleError(
      DirectoryErrorCode.NameConflict,
      `Sibling directory named "${name}" already exists`,
    );
  },

  /**
   * Reject moves that would create a cycle — i.e. when `newParent` is
   * `target` itself or any of its descendants. We walk `newParent`'s
   * ancestor chain because ancestors are bounded by depth, whereas the
   * descendant set is unbounded.
   */
  async assertNotCyclicMove(
    target: Directory,
    newParent: Directory,
    repo: DirectoryRepository,
  ): Promise<void> {
    if (newParent.id === target.id) {
      throw new BusinessRuleError(
        DirectoryErrorCode.CyclicMove,
        "Cannot move a directory under itself",
      );
    }
    const ancestors = await repo.findAncestors(newParent.id);
    for (const ancestor of ancestors) {
      if (ancestor.id === target.id) {
        throw new BusinessRuleError(
          DirectoryErrorCode.CyclicMove,
          "Cannot move a directory under one of its descendants",
        );
      }
    }
  },

  /**
   * Build the `/`-delimited display path by walking from root to `dir`.
   * The root directory's slug is empty so the result for a node at
   * depth 2 looks like `/parent-slug/child-slug`.
   */
  async computePath(
    dir: Directory,
    repo: DirectoryRepository,
  ): Promise<DirectoryPath> {
    if (Directory.isRoot(dir)) {
      return DirectoryPath.root();
    }
    const ancestors = await repo.findAncestors(dir.id);
    const segments: DirectorySlug[] = [];
    for (const ancestor of ancestors) {
      if (Directory.isChild(ancestor)) {
        segments.push(ancestor.slug);
      }
    }
    segments.push(dir.slug);
    return DirectoryPath.fromSegments(segments);
  },

  /**
   * Build the structured root→leaf path for breadcrumb rendering: each
   * `isChild` ancestor plus `dir` itself, as `{ id, name }` pairs.
   *
   * Unlike `computePath` (slug string), this keeps the directory ids so
   * presentation can link each segment. Root directories are excluded via
   * the `isChild` guard (`parentId !== null`) rather than a name check —
   * `DirectoryName.forRoot()` is not guaranteed to be empty. A root-level
   * `dir` therefore yields an empty array.
   */
  async computeSegments(
    dir: Directory,
    repo: DirectoryRepository,
  ): Promise<readonly { id: DirectoryId; name: DirectoryName }[]> {
    if (Directory.isRoot(dir)) {
      return [];
    }
    const ancestors = await repo.findAncestors(dir.id);
    const segments: { id: DirectoryId; name: DirectoryName }[] = [];
    for (const ancestor of ancestors) {
      if (Directory.isChild(ancestor)) {
        segments.push({ id: ancestor.id, name: ancestor.name });
      }
    }
    segments.push({ id: dir.id, name: dir.name });
    return segments;
  },

  /**
   * Build the structured root→leaf segments for many directories in a
   * single tree read, the batch counterpart to {@link computeSegments}.
   *
   * `computeSegments` issues one `findAncestors` per directory, so calling
   * it once per referrer (`getBacklinks` is unbounded) is an `O(n)` query
   * fan-out. This loads `findTree(ownerId)` once, builds an id→node map in
   * memory, and walks each `dirId`'s parent chain locally — `O(1)` queries
   * regardless of `dirIds` length (the `collectSubtreeIds` "tree once +
   * memory walk" pattern).
   *
   * The result maps every requested `dirId` to its segments (each `isChild`
   * ancestor plus the directory itself, root-first). A root directory, an
   * id absent from the owner's tree, or a chain that hits a missing parent
   * all yield an empty array — the same "structurally empty" fallback the
   * single-shot variant gives for a root-level node. The `visited` guard is
   * belt-and-braces against a malformed adjacency cycle.
   */
  async computeSegmentsForMany(
    ownerId: UserId,
    dirIds: readonly DirectoryId[],
    repo: DirectoryRepository,
  ): Promise<
    ReadonlyMap<
      DirectoryId,
      readonly { id: DirectoryId; name: DirectoryName }[]
    >
  > {
    const result = new Map<
      DirectoryId,
      readonly { id: DirectoryId; name: DirectoryName }[]
    >();
    if (dirIds.length === 0) {
      return result;
    }
    const all = await repo.findTree(ownerId);
    const byId = new Map<string, Directory>();
    for (const dir of all) {
      byId.set(dir.id, dir);
    }
    for (const dirId of dirIds) {
      if (result.has(dirId)) {
        continue;
      }
      const start = byId.get(dirId);
      if (start === undefined || Directory.isRoot(start)) {
        result.set(dirId, []);
        continue;
      }
      // Walk parent-ward collecting `isChild` nodes, then reverse to
      // root-first. A missing parent (cross-owner / drifted id) or a cycle
      // aborts to an empty path rather than a partial one.
      const chain: { id: DirectoryId; name: DirectoryName }[] = [];
      const visited = new Set<string>();
      let cursor: Directory | undefined = start;
      let broken = false;
      while (cursor !== undefined && Directory.isChild(cursor)) {
        if (visited.has(cursor.id)) {
          broken = true;
          break;
        }
        visited.add(cursor.id);
        chain.push({ id: cursor.id, name: cursor.name });
        const parent: Directory | undefined = byId.get(cursor.parentId);
        if (parent === undefined) {
          broken = true;
          break;
        }
        cursor = Directory.isRoot(parent) ? undefined : parent;
      }
      result.set(dirId, broken ? [] : chain.reverse());
    }
    return result;
  },

  /**
   * Idempotently ensure the per-owner root exists. Returns the existing
   * root or mints a fresh one via `idGen` and persists it. Called from
   * SignUp / AdminSignUp flows and from CreateDirectory when `parentId`
   * is omitted.
   */
  async ensureRoot(
    ownerId: UserId,
    now: Date,
    idGen: IdGenerator,
    repo: DirectoryRepository,
  ): Promise<RootDirectory> {
    const existing = await repo.findRoot(ownerId);
    if (existing !== null) {
      if (!Directory.isRoot(existing)) {
        throw new BusinessRuleError(
          DirectoryErrorCode.RootMustHaveNoParent,
          "Stored root directory has a parent",
        );
      }
      return existing;
    }
    const root = Directory.createRoot({ id: idGen.next(), ownerId }, now);
    await repo.insert(root);
    return root;
  },

  /**
   * Idempotently ensure a nested directory path exists under the owner's
   * root, returning the id of the deepest segment.
   *
   * Walks `segments` top-down from the root: for each segment it reuses an
   * existing case-insensitive sibling when present, otherwise mints a new
   * `ChildDirectory` (which enforces the depth cap via `DirectoryDepth.next`
   * and throws `DirectoryErrorCode.TooDeep` past `MAX_DIRECTORY_DEPTH`) and
   * inserts it. An empty `segments` returns the root id, so callers can
   * route the "no new path / root fallback" case through here uniformly.
   *
   * The `ensureRoot`-symmetric counterpart for multi-segment creation:
   * intermediate reuse gives idempotent partial-path merging (an existing
   * `親` is reused while a missing `子` is created).
   */
  async ensureNestedPath(
    ownerId: UserId,
    segments: readonly DirectoryName[],
    now: Date,
    idGen: IdGenerator,
    repo: DirectoryRepository,
  ): Promise<DirectoryId> {
    const root = await this.ensureRoot(ownerId, now, idGen, repo);
    let parent: Directory = root;
    for (const segment of segments) {
      const existing = await repo.findBySiblingName(
        parent.id,
        ownerId,
        segment,
      );
      if (existing !== null) {
        parent = existing;
        continue;
      }
      const child = Directory.create(
        { id: idGen.next(), ownerId, parent, name: segment },
        now,
      );
      await repo.insert(child);
      parent = child;
    }
    return parent.id;
  },

  /**
   * Collect `rootId` together with every descendant directory id under
   * the owner's tree, for subtree-scoped note filtering.
   *
   * `findTree(ownerId)` returns the owner's directories in a single
   * query; we build the `parentId` adjacency list in memory and walk it
   * breadth-first from `rootId`. This avoids the per-node `findChildren`
   * N+1 that `deleteSubtree` incurs — listing is read-hot, so the single
   * round trip matters.
   *
   * When `rootId` is not part of the owner's tree (malformed or
   * cross-owner id) the result is empty; the caller treats that as a
   * structurally-empty listing (`.issue/392/adr.md` ADR-002). The
   * `visited` guard is belt-and-braces against a malformed adjacency
   * cycle — the depth cap + tree shape already preclude one.
   */
  async collectSubtreeIds(
    rootId: DirectoryId,
    ownerId: UserId,
    repo: DirectoryRepository,
  ): Promise<readonly DirectoryId[]> {
    const all = await repo.findTree(ownerId);
    const childrenByParent = new Map<string, DirectoryId[]>();
    let rootExists = false;
    for (const dir of all) {
      if (dir.id === rootId) {
        rootExists = true;
      }
      if (dir.parentId !== null) {
        const siblings = childrenByParent.get(dir.parentId) ?? [];
        siblings.push(dir.id);
        childrenByParent.set(dir.parentId, siblings);
      }
    }
    if (!rootExists) {
      return [];
    }

    const collected: DirectoryId[] = [];
    const visited = new Set<string>();
    const queue: DirectoryId[] = [rootId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) {
        break;
      }
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      collected.push(current);
      const children = childrenByParent.get(current) ?? [];
      for (const child of children) {
        queue.push(child);
      }
    }
    return collected;
  },

  /**
   * Delete `dir` and every descendant directory depth-first, trashing
   * each directory's active notes along the way. The caller (usecase)
   * is responsible for emitting `note.deleted` Outbox events using the
   * returned `trashedNoteIds`.
   *
   * Notes are trashed via `noteRepo.trashByDirectory` so that note
   * state transitions and the matching domain events stay owned by the
   * note aggregate — directory service only orchestrates the walk and
   * the per-directory physical delete.
   */
  async deleteSubtree(
    dir: Directory,
    _now: Date,
    repos: {
      dirRepo: DirectoryRepository;
      noteRepo: NoteRepository;
    },
  ): Promise<{
    trashedNoteIds: readonly NoteId[];
    deletedDirectoryIds: readonly DirectoryId[];
  }> {
    if (Directory.isRoot(dir)) {
      throw new BusinessRuleError(
        DirectoryErrorCode.CannotDeleteRoot,
        "Cannot delete the root directory",
      );
    }

    const trashedNoteIds: NoteId[] = [];
    const deletedDirectoryIds: DirectoryId[] = [];

    // Iterative depth-first walk. Two passes per node — first to enqueue
    // its children, then a post-order action recorded on `pending`. The
    // explicit stack mirrors the natural recursion without blowing the
    // call stack on deep trees.
    const visit: ChildDirectory[] = [dir];
    const postOrder: ChildDirectory[] = [];
    while (visit.length > 0) {
      const node = visit.pop();
      if (node === undefined) {
        break;
      }
      postOrder.push(node);
      const children = await repos.dirRepo.findChildren(node.id);
      for (const child of children) {
        if (Directory.isChild(child)) {
          visit.push(child);
        }
      }
    }

    // Post-order: deepest nodes first so each directory is empty by the
    // time its physical delete runs.
    for (let i = postOrder.length - 1; i >= 0; i -= 1) {
      const node = postOrder[i];
      if (node === undefined) {
        continue;
      }
      const trashed = await repos.noteRepo.trashByDirectory(node.id);
      for (const id of trashed) {
        trashedNoteIds.push(id);
      }
      const versioned = await repos.dirRepo.findById(node.id);
      if (versioned === null) {
        // Concurrent delete already removed it — treat as already done.
        continue;
      }
      await repos.dirRepo.delete(
        versioned.entity.id,
        versioned.expectedVersion,
      );
      deletedDirectoryIds.push(node.id);
    }

    return { trashedNoteIds, deletedDirectoryIds };
  },
};
