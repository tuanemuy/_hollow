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
}
