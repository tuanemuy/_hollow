import type { TransactionalRepository } from "@/core/domain/common/transactionalRepository";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { Tag } from "../entity";
import type { TagId, TagName } from "../valueObject";

/**
 * Read-only listing options for `findByOwner`.
 *
 * Listing is offset/limit-style rather than cursor-based to keep
 * call sites simple — Tag catalogues are bounded per user. `sort`
 * defaults to `name` (alphabetical) on the adapter side.
 */
export type TagListOpts = Readonly<{
  limit: number;
  offset: number;
  sort?: "name" | "noteCount" | "createdAt";
  order?: "asc" | "desc";
  query?: string;
}>;

/**
 * `TagRepository` inherits the OCC-enforced contract
 * (`insert` / `findById` / `save` / `delete`) from
 * `TransactionalRepository<Tag>` and adds the read-only queries that
 * tag usecases need.
 *
 * `findByOwnerAndName` / `findByOwner` / `findByIds` are listing-style
 * reads that do not declare write intent — callers that intend to
 * mutate must still go through `findById` to capture an
 * `ExpectedVersion<Tag>` token.
 */
export interface TagRepository extends TransactionalRepository<Tag> {
  findByOwnerAndName(ownerId: UserId, name: TagName): Promise<Tag | null>;
  findByOwner(ownerId: UserId, opts: TagListOpts): Promise<readonly Tag[]>;
  findByIds(ids: readonly TagId[]): Promise<readonly Tag[]>;
}
