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
  sort?: "name" | "noteCount" | "createdAt" | "lastUsedAt";
  order?: "asc" | "desc";
  query?: string;
}>;

/**
 * A listed tag paired with its read-time usage aggregates. `noteCount` is
 * aggregated at query time (active `note_tags` for the owner) rather than
 * stored on the `Tag` aggregate, so it is carried alongside the entity
 * only on the listing path that displays it.
 *
 * `lastUsedAt` is the same family of read-time aggregate (Issue #569): the
 * `MAX(notes.updatedAt)` over the owner's active notes linked to the tag.
 * It is **not** a field of the `Tag` aggregate. `null` when the tag has no
 * active note links (an unused tag).
 */
export type TagWithNoteCount = Readonly<{
  tag: Tag;
  noteCount: number;
  lastUsedAt: Date | null;
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
  /**
   * Lists an owner's tags with the read-time note-usage count (see
   * `TagWithNoteCount`). This is the only `find*` that returns the
   * aggregate; the others return bare `Tag` entities.
   */
  findByOwner(
    ownerId: UserId,
    opts: TagListOpts,
  ): Promise<readonly TagWithNoteCount[]>;
  findByIds(ids: readonly TagId[]): Promise<readonly Tag[]>;

  /**
   * Owner-scoped tags whose `name` matches `prefix` as a case-insensitive
   * prefix (compared against `nameNormalized`). Ordered by name asc, id
   * asc. Same caller contract as `NoteRepository.searchByTitlePrefix` —
   * the caller trims `prefix` and clamps `limit`, the adapter LIKE-escapes
   * wildcards.
   */
  searchByNamePrefix(
    ownerId: UserId,
    prefix: string,
    limit: number,
  ): Promise<readonly Tag[]>;
}
