import type { TransactionalRepository } from "@/core/domain/common/transactionalRepository";
import type { User } from "../entity";
import type { EmailAddress, UserId, Username } from "../valueObject";

/**
 * `UserRepository` inherits the OCC-enforced contract
 * (`insert` / `findById` / `save` / `delete`) from
 * `TransactionalRepository<User>` and adds the lookup queries that
 * Identity usecases need.
 *
 * - `findByUsername` / `findByEmail` are read-only lookups; they do not
 *   issue an OCC token because Identity usecases never load-then-write
 *   through these paths (uniqueness assertions read for negative-only
 *   purposes, login reads to map credential → user without mutating).
 *   Any write-after-read flow must go through `findById`.
 * - `countAdmins` counts admins with `status !== 'deleted'` (suspended
 *   admins included; see domain spec note on `assertNotLastAdmin`).
 * - `listAll` is the admin-console paging query — cursor-based on
 *   `UserId` to avoid offset drift.
 *
 * Find methods return rows regardless of `status === 'deleted'`; callers
 * filter by status as needed. Permanent username / email reservation
 * across deleted rows is enforced inside the adapter's uniqueness
 * checks, not by domain-side filtering.
 */
export interface UserRepository extends TransactionalRepository<User> {
  findByUsername(username: Username): Promise<User | null>;
  findByEmail(email: EmailAddress): Promise<User | null>;
  countAdmins(): Promise<number>;
  listAll(opts: { limit: number; cursor?: UserId }): Promise<readonly User[]>;

  /**
   * Bulk read by ids for listing pipelines (e.g. sitemap projection)
   * without N+1 queries. Order is not guaranteed; the caller must
   * re-index by id (typically via `Map<UserId, User>`) when preserving
   * input order matters. Ids without a matching row are simply absent
   * from the result. An empty `ids` argument short-circuits to `[]`
   * without touching the DB.
   *
   * This is the read-only counterpart to `findById`, which mints an OCC
   * token for write-after-read flows. Read-only listing must use this
   * method to avoid synthesising OCC tokens that will never be consumed.
   */
  findByIds(ids: readonly UserId[]): Promise<readonly User[]>;

  /**
   * Cross-user username suggestion for the public search surface. Returns
   * users whose `username` matches `prefix` as a case-insensitive prefix,
   * restricted to live authors who own at least one publicly visible
   * note: `status NOT IN ('deleted', 'suspended')` AND an `EXISTS`
   * against `publication_states(visibility = 'public')`. The public-note
   * gate is the enumeration guard — a user with no public notes never
   * surfaces. Ordered by username asc. Caller trims `prefix` and clamps
   * `limit`; the adapter LIKE-escapes wildcards.
   */
  searchPublicByUsernamePrefix(
    prefix: string,
    limit: number,
  ): Promise<readonly User[]>;
}
