import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { ContentHtml } from "@/core/domain/note/valueObject";
import { Tag } from "./entity";
import { TagErrorCode } from "./errorCode";
import type { TagBlacklistRepository } from "./ports/tagBlacklistRepository";
import type { TagRepository } from "./ports/tagRepository";
import { type TagId, TagName } from "./valueObject";

/**
 * Plan returned by `computeMergePlan`. The plan only carries the
 * identifiers — Note side rewriting (`tagIds[]`) is the MergeTags
 * usecase's responsibility through `NoteRepository`, not this
 * service's.
 */
export type TagMergePlan = Readonly<{
  fromTagId: TagId;
  toTagId: TagId;
}>;

/**
 * Structural identity-generator dependency.
 *
 * Domain layer cannot import the application-side `IdGenerator` port
 * directly (that would invert the dependency arrow), so the
 * `resolveOrCreate` operation accepts a minimal callable token.
 * Application code passes `container.idGenerator.next` here.
 */
export type TagIdMinter = () => string;

/**
 * Canonical `#tag` token pattern. Exported so the display-time renderer
 * (`UltrahtmlNoteBodyRenderer`) marks up exactly the same tokens this
 * service extracts — a single source prevents the extract and the display
 * passes from drifting (ADR-005, Issue #549). The `/g` flag carries
 * `lastIndex` state, so consumers must use `matchAll` (fresh iterator per
 * call) or clone the regex rather than share the instance.
 */
export const HASHTAG_PATTERN = /#([^\s#<>"'`]+)/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `TagService` collects cross-aggregate operations on tags that are
 * either pure (`computeMergePlan` / `renameInBody` / `extractFromHtml`)
 * or require a repository to verify a domain invariant
 * (`assertNameUnique` / `resolveOrCreate`).
 *
 * Storage adapters are passed in by usecases; the service stays
 * stateless and free of clock / id generation by accepting them as
 * arguments.
 */
export const TagService = {
  /**
   * Verifies that `name` is unique within `ownerId`'s catalogue,
   * optionally allowing the existing tag identified by `exceptId`
   * (used during rename). Throws `BusinessRuleError` when the name is
   * already taken by a different tag.
   */
  async assertNameUnique(
    ownerId: UserId,
    name: TagName,
    exceptId: TagId | null,
    repo: TagRepository,
  ): Promise<void> {
    const existing = await repo.findByOwnerAndName(ownerId, name);
    if (existing === null) {
      return;
    }
    if (exceptId !== null && existing.id === exceptId) {
      return;
    }
    throw new BusinessRuleError(
      TagErrorCode.NameNotUnique,
      `Tag name already exists for owner: ${name}`,
    );
  },

  /**
   * Validates that two tags can be merged and returns the rewrite
   * plan. The Note-side `tagIds` rewrite is performed by the
   * MergeTags usecase via `NoteRepository`.
   *
   * - `ownerId` must match (cross-owner merge is rejected)
   * - source and target must be different tags
   */
  computeMergePlan(source: Tag, target: Tag): TagMergePlan {
    if (source.ownerId !== target.ownerId) {
      throw new BusinessRuleError(
        TagErrorCode.MergeOwnerMismatch,
        "Cannot merge tags owned by different users",
      );
    }
    if (source.id === target.id) {
      throw new BusinessRuleError(
        TagErrorCode.MergeSameTag,
        "Cannot merge a tag into itself",
      );
    }
    return { fromTagId: source.id, toTagId: target.id };
  },

  /**
   * Replaces `#oldName` occurrences in `html` with `#newName`,
   * matching on a word boundary so that `#foo` inside `#foobar` is
   * not touched. Pure — the caller is responsible for re-sanitising
   * if the surrounding template requires it.
   *
   * The replacement preserves the original `ContentHtml` brand; the
   * domain trusts that the input was sanitised upstream.
   */
  renameInBody(
    html: ContentHtml,
    oldName: TagName,
    newName: TagName,
  ): ContentHtml {
    if (TagName.equals(oldName, newName)) {
      return html;
    }
    // The trailing lookahead encodes "next char is not a tag-body char"
    // — i.e. whitespace, end of string, or HTML metacharacter. This
    // mirrors how `extractFromHtml` defines a hashtag token.
    const pattern = new RegExp(
      `#${escapeRegExp(oldName)}(?=$|[\\s#<>"'\`])`,
      "g",
    );
    const replaced = (html as string).replace(pattern, `#${newName}`);
    return replaced as ContentHtml;
  },

  /**
   * Extracts hashtag tokens from `html`. Tokens are recognised as
   * `#` followed by a run of non-whitespace, non-`#`, non-HTML-meta
   * characters. Invalid tokens (those that fail `TagName.create`)
   * are silently dropped; duplicates are de-duplicated by canonical
   * name.
   */
  extractFromHtml(html: ContentHtml): readonly TagName[] {
    const seen = new Set<string>();
    const out: TagName[] = [];
    const matches = (html as string).matchAll(HASHTAG_PATTERN);
    for (const match of matches) {
      const raw = match[1];
      if (raw === undefined) continue;
      let name: TagName;
      try {
        name = TagName.create(raw);
      } catch {
        continue;
      }
      if (seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
    return out;
  },

  /**
   * Resolves a list of tag names to ids for `ownerId`. For each name:
   *
   * - if the name is blacklisted for the owner, it is skipped
   * - if a tag with that name already exists, its id is returned
   * - otherwise a new `Tag` is created with `mintId()` / `now` and
   *   inserted via `repo`
   *
   * Returns the resolved ids in input order, with blacklisted /
   * dropped names omitted. De-duplication is performed across the
   * input list so the same name resolves to a single id even if it
   * appears multiple times.
   */
  async resolveOrCreate(
    ownerId: UserId,
    names: readonly TagName[],
    mintId: TagIdMinter,
    now: Date,
    repo: TagRepository,
    blacklistRepo: TagBlacklistRepository,
  ): Promise<readonly TagId[]> {
    const seen = new Set<string>();
    const out: TagId[] = [];
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      if (await blacklistRepo.isBlacklisted(ownerId, name)) {
        continue;
      }
      const existing = await repo.findByOwnerAndName(ownerId, name);
      if (existing !== null) {
        out.push(existing.id);
        continue;
      }
      const created = Tag.create({ id: mintId(), ownerId, name }, now);
      await repo.insert(created);
      out.push(created.id);
    }
    return out;
  },
};
