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
 * `lastUsedAt` is the same family of read-time aggregate: the
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

  /**
   * Cross-owner tag suggestion for the public search surface. Returns
   * distinct tag names (not `Tag` entities — owner is intentionally not
   * exposed across users) whose `nameNormalized` matches `prefix` as a
   * case-insensitive prefix AND that are linked to at least one publicly
   * visible, active note (`note_tags` × `notes(active)` ×
   * `publication_states(public)`). The "linked to a public note" gate is
   * the enumeration guard — a private-only tag never surfaces. Ordered by
   * name asc. Caller trims `prefix` and clamps `limit`; the adapter
   * LIKE-escapes wildcards.
   */
  searchPublicByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<readonly string[]>;

  /**
   * Owner-scoped distinct tag names linked to at least one public + active
   * note (`note_tags` × `notes(active)` × `publication_states(public)`).
   * The public gate is the enumeration guard: a tag attached only to
   * private/trashed notes never surfaces. Ordered by name asc. Capped at
   * `limit` (the master-set bound for the public filter-row's "+タグ" picker).
   *
   * Unlike `searchPublicByNamePrefix` (cross-owner, prefix, owner秘匿) this is
   * owner-scoped with no prefix — the public profile page's tag母集合.
   *
   * Owner-scope gates on `notes.owner_id`, not the tag's owner: the result is
   * "tag names attached to *this owner's* public notes", not "tags this owner
   * owns". `note_tags` does not constrain owner, so the predicate must live on
   * the notes join.
   *
   * The public gate is intentionally visibility+status only (no
   * `published_at IS NOT NULL`), matching `searchPublicByNamePrefix` /
   * `getPublicNote`. `public ⇒ published_at != null` always holds structurally
   * (every visibility transition stamps `published_at` on going public), so the
   * extra gate would be redundant here. If a future write path can produce a
   * `public` row with null `published_at`, add the gate to *all* visibility-only
   * read paths together.
   */
  listPublicTagNamesByOwner(
    ownerId: UserId,
    limit: number,
  ): Promise<readonly string[]>;
}
