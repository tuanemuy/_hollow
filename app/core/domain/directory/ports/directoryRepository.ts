import type { TransactionalRepository } from "@/core/domain/common/transactionalRepository";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { Directory } from "../entity";
import type { DirectoryId, DirectoryName } from "../valueObject";

/**
 * `DirectoryRepository` inherits the OCC-enforced contract
 * (`insert` / `findById` / `save` / `delete`) from
 * `TransactionalRepository<Directory>` and adds read-only queries
 * that hierarchy services need.
 *
 * `delete` removes a single directory and assumes its subtree has
 * already been handled — `DirectoryService.deleteSubtree` is the only
 * sanctioned orchestrator for "delete with children". Implementations
 * must reject deletion when descendants still exist.
 *
 * `findBySiblingName` performs the case-insensitive sibling-name
 * lookup that `DirectoryService.assertSiblingNameUnique` needs.
 */
export interface DirectoryRepository
  extends TransactionalRepository<Directory> {
  /** Per-owner root lookup. Returns `null` if the owner has no root yet. */
  findRoot(ownerId: UserId): Promise<Directory | null>;

  /** Direct children of `parentId`. */
  findChildren(parentId: DirectoryId): Promise<readonly Directory[]>;

  /**
   * Flat list of every directory owned by `ownerId`. Callers
   * assemble the tree from `parentId` references.
   */
  findTree(ownerId: UserId): Promise<readonly Directory[]>;

  /** Ancestors of `id` ordered root-first; excludes the node itself. */
  findAncestors(id: DirectoryId): Promise<readonly Directory[]>;

  /**
   * Sibling lookup by case-insensitive name. `parentId === null` matches
   * the owner's root-level children.
   */
  findBySiblingName(
    parentId: DirectoryId | null,
    ownerId: UserId,
    name: DirectoryName,
  ): Promise<Directory | null>;
}
