import type { TransactionalRepository } from "@/core/domain/common/transactionalRepository";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { SavedView } from "../entity";
import type { SavedViewName, ViewKind } from "../valueObject";

/**
 * `SavedViewRepository` inherits the OCC-enforced contract
 * (`insert` / `findById` / `save` / `delete`) from
 * `TransactionalRepository<SavedView>` and adds the read-only owner /
 * default lookups that View usecases need.
 *
 * Single-default enforcement (`SavedViewService.ensureSingleDefault`)
 * and case-insensitive name uniqueness
 * (`SavedViewService.assertNameUnique`) are layered on top of these
 * primitives — the repository itself does not police uniqueness, it
 * only exposes the lookups.
 */
export interface SavedViewRepository
  extends TransactionalRepository<SavedView> {
  /** Every saved view of `kind` owned by `ownerId`. Empty array if none. */
  findByOwner(ownerId: UserId, kind: ViewKind): Promise<readonly SavedView[]>;

  /** The owner's default view for `kind`, or `null` if no default is set. */
  findDefault(ownerId: UserId, kind: ViewKind): Promise<SavedView | null>;

  /**
   * Lookup by (owner, kind, case-insensitive name). Used by
   * `SavedViewService.assertNameUnique` to detect collisions before
   * create / rename. Returns `null` when no match exists.
   */
  findByName(
    ownerId: UserId,
    kind: ViewKind,
    name: SavedViewName,
  ): Promise<SavedView | null>;
}
