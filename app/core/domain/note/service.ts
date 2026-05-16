import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { MediaAssetRepository } from "@/core/domain/media/ports/mediaAssetRepository";
import { MediaAssetId } from "@/core/domain/media/valueObject";
import type { TagBlacklistRepository } from "@/core/domain/tag/ports/tagBlacklistRepository";
import type { TagRepository } from "@/core/domain/tag/ports/tagRepository";
import { TagService } from "@/core/domain/tag/service";
import type { TagId, TagName } from "@/core/domain/tag/valueObject";
import { type Note, Note as NoteAggregate } from "./entity";
import { NoteErrorCode } from "./errorCode";
import type { HtmlSanitizer } from "./ports/htmlSanitizer";
import type { NoteRepository } from "./ports/noteRepository";
import {
  type ContentHtml,
  InternalLinkRef,
  type InternalLinkRef as InternalLinkRefType,
  type NoteId,
  NoteSlug,
  NoteTitle,
} from "./valueObject";

/**
 * Structural identity-generator dependency.
 *
 * The domain layer cannot import the application-side `IdGenerator` port
 * directly (that would invert the dependency arrow). Callers in the
 * application layer pass `container.idGenerator.next` as `NoteIdMinter`.
 */
export type NoteIdMinter = () => string;

const DUPLICATE_TITLE_SUFFIX = " (コピー)";
const SLUG_FALLBACK_MAX_TRIES = 64;

const slugFromTitle = (title: NoteTitle): string => {
  // Mirrors `DirectorySlug.fromName` shape: ASCII-fold, collapse
  // non-alphanumeric runs to dashes, drop leading / trailing dashes.
  return (title as string)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const fallbackSlugBase = (base: string): string => {
  if (base.length > 0) {
    return base;
  }
  return "note";
};

const MEDIA_ID_FROM_URL = /\/media\/([0-9a-z-]+)/i;
const INTERNAL_LINK_PATTERN = /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g;
const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * `NoteService` collects cross-aggregate operations on notes — slug
 * uniqueness, internal-link resolution, body / media consistency, and
 * the input-assembly pipeline that `Note.create` / `Note.updateContent`
 * lean on.
 *
 * Each method is a stateless helper; clock / id generation are passed
 * in by callers in the application layer.
 */
export const NoteService = {
  /**
   * Reject creating / renaming a note with a slug already taken by
   * another note of the same owner. `exceptId` is non-null for rename
   * flows so the note being mutated does not match itself.
   */
  async assertSlugUnique(
    ownerId: UserId,
    slug: NoteSlug,
    exceptId: NoteId | null,
    repo: NoteRepository,
  ): Promise<void> {
    const existing = await repo.findByOwnerAndSlug(ownerId, slug);
    if (existing === null) {
      return;
    }
    if (exceptId !== null && existing.id === exceptId) {
      return;
    }
    throw new BusinessRuleError(
      NoteErrorCode.InvalidSlug,
      `Slug already in use: ${slug}`,
    );
  },

  /**
   * Extract structured metadata from a sanitised HTML body.
   *
   * - `tagsFromBody`: deduplicated `TagName` tokens recognised by
   *   `TagService.extractFromHtml`.
   * - `internalLinks`: `[[target]]` / `[[id|display]]` tokens — id-keyed
   *   targets that look like UUIDv7 become `kind=id`; everything else
   *   becomes `kind=title`.
   * - `mediaIds`: media ids inferred from `<img>` / `<video>` /
   *   `<source>` `src` attributes that match the `/media/<id>` URL
   *   shape used by the storage adapter. Adapters that emit a different
   *   URL layout should re-implement this in `HtmlSanitizer` /
   *   metadata extraction.
   */
  extractMetadataFromHtml(html: ContentHtml): {
    tagsFromBody: readonly TagName[];
    internalLinks: readonly InternalLinkRefType[];
    mediaIds: readonly MediaAssetId[];
  } {
    const tagsFromBody = TagService.extractFromHtml(html);

    const internalLinks: InternalLinkRefType[] = [];
    const internalSeen = new Set<string>();
    for (const match of (html as string).matchAll(INTERNAL_LINK_PATTERN)) {
      const target = match[1]?.trim();
      const display = match[2]?.trim();
      if (target === undefined || target.length === 0) continue;
      const key = `${UUID_V7_PATTERN.test(target) ? "id" : "title"}:${target}`;
      if (internalSeen.has(key)) continue;
      internalSeen.add(key);
      try {
        internalLinks.push(
          InternalLinkRef.create({
            kind: UUID_V7_PATTERN.test(target) ? "id" : "title",
            target,
            displayText: display && display.length > 0 ? display : null,
          }),
        );
      } catch {
        // Token failed VO validation (e.g. title > 200 chars). Drop it
        // — extraction is best-effort.
      }
    }

    const mediaIds: MediaAssetId[] = [];
    const mediaSeen = new Set<string>();
    const mediaPattern =
      /<(?:img|video|source)[^>]*\ssrc=["']([^"']+)["'][^>]*>/gi;
    for (const match of (html as string).matchAll(mediaPattern)) {
      const src = match[1];
      if (src === undefined) continue;
      const mm = MEDIA_ID_FROM_URL.exec(src);
      if (mm === null) continue;
      const raw = mm[1];
      if (raw === undefined || mediaSeen.has(raw)) continue;
      mediaSeen.add(raw);
      try {
        mediaIds.push(MediaAssetId.create(raw));
      } catch {
        // Non-conforming id — ignore.
      }
    }

    return { tagsFromBody, internalLinks, mediaIds };
  },

  /**
   * Resolve `kind=title` references to ids by looking up the owner's
   * note catalogue. References that do not match a current note stay
   * `resolvedNoteId === null` (rendered as unresolved). `kind=id`
   * references are not re-checked because their target is already
   * canonical.
   */
  async resolveInternalLinks(
    refs: readonly InternalLinkRefType[],
    ownerId: UserId,
    repo: NoteRepository,
  ): Promise<readonly InternalLinkRefType[]> {
    const out: InternalLinkRefType[] = [];
    for (const ref of refs) {
      if (ref.kind === "id") {
        out.push(ref);
        continue;
      }
      try {
        const slugLike = NoteSlug.create(ref.target);
        const candidate = await repo.findByOwnerAndSlug(ownerId, slugLike);
        out.push(
          InternalLinkRef.withResolved(
            ref,
            candidate === null ? null : candidate.id,
          ),
        );
      } catch {
        // Target isn't a valid slug — keep the unresolved reference so
        // the editor can still surface "broken link" to the user.
        out.push(InternalLinkRef.withResolved(ref, null));
      }
    }
    return out;
  },

  /**
   * Reject when the body references a media asset owned by someone
   * else (or no longer present). Missing assets are treated as
   * `media_not_owned` because the body cannot rely on a value the
   * storage layer cannot vouch for.
   */
  async assertMediaOwnership(
    mediaIds: readonly MediaAssetId[],
    ownerId: UserId,
    repo: MediaAssetRepository,
  ): Promise<void> {
    if (mediaIds.length === 0) {
      return;
    }
    const assets = await repo.findByIds(mediaIds);
    const byId = new Map(assets.map((a) => [a.id, a] as const));
    for (const id of mediaIds) {
      const asset = byId.get(id);
      if (asset === undefined || asset.ownerId !== ownerId) {
        throw new BusinessRuleError(
          NoteErrorCode.MediaNotOwned,
          `Media asset ${id} is not owned by ${ownerId}`,
        );
      }
    }
  },

  /**
   * Mint a slug that is unique within `ownerId`'s notes. Starts from a
   * kebab-case derivation of `title`, then appends a numeric suffix
   * until the lookup misses. Falls back to `note` for titles whose
   * normalised form is empty (e.g. CJK-only titles where the
   * non-alphanumeric collapse strips every character).
   */
  async generateUniqueSlug(
    ownerId: UserId,
    title: NoteTitle,
    repo: NoteRepository,
  ): Promise<NoteSlug> {
    const base = fallbackSlugBase(slugFromTitle(title));
    const baseSlug = NoteSlug.create(base.slice(0, 120));
    const existing = await repo.findByOwnerAndSlug(ownerId, baseSlug);
    if (existing === null) {
      return baseSlug;
    }
    for (let i = 2; i <= SLUG_FALLBACK_MAX_TRIES; i += 1) {
      const suffix = `-${i}`;
      const candidate = `${base.slice(0, 120 - suffix.length)}${suffix}`;
      const candidateSlug = NoteSlug.create(candidate);
      const hit = await repo.findByOwnerAndSlug(ownerId, candidateSlug);
      if (hit === null) {
        return candidateSlug;
      }
    }
    throw new BusinessRuleError(
      NoteErrorCode.InvalidSlug,
      `Unable to generate unique slug from title: ${title}`,
    );
  },

  /**
   * Build a duplicate of `source` ready for persistence. Reuses the
   * existing tags / internal links / media refs; the only mutations are
   * a fresh id, a new unique slug, and a "(コピー)" suffix on the title.
   *
   * The returned aggregate is in `active` status with no edit lock; the
   * caller is responsible for inserting it via the repository and
   * collecting the `note.created` event.
   */
  async duplicate(
    source: Note,
    now: Date,
    mintId: NoteIdMinter,
    repo: NoteRepository,
  ): Promise<ReturnType<typeof NoteAggregate.create>> {
    const baseTitle = source.title as string;
    const dupTitleRaw = `${baseTitle}${DUPLICATE_TITLE_SUFFIX}`;
    const truncated = dupTitleRaw.slice(0, 200);
    const dupTitle = NoteTitle.create(truncated);
    const newSlug = await NoteService.generateUniqueSlug(
      source.ownerId,
      dupTitle,
      repo,
    );
    return NoteAggregate.create(
      {
        id: mintId(),
        ownerId: source.ownerId,
        directoryId: source.directoryId,
        slug: newSlug,
        title: dupTitle,
        contentHtml: source.contentHtml,
        frontMatter: source.frontMatter,
        tagIds: source.tagIds,
        internalLinkRefs: source.internalLinkRefs,
        mediaRefs: source.mediaRefs,
      },
      now,
    );
  },

  /**
   * End-to-end assembly pipeline for note bodies. Every `Note.create`
   * / `Note.updateContent` call in the application layer must run its
   * raw inputs through this helper so the aggregate only ever sees a
   * fully reconciled body.
   *
   * Order of operations:
   * 1. `HtmlSanitizer.sanitize` — escape / strip unsafe nodes.
   * 2. `extractMetadataFromHtml` — pull tag tokens, internal links,
   *    media references out of the sanitised body.
   * 3. Merge the declared tag names with the extracted ones (declared
   *    takes precedence on order; extraction fills in references the
   *    user did not list explicitly).
   * 4. `TagService.resolveOrCreate` — convert names → ids, creating
   *    new tags where needed and skipping blacklisted names.
   * 5. `resolveInternalLinks` — title-keyed refs → id-keyed refs.
   * 6. `assertMediaOwnership` — fail fast if the body references a
   *    media asset the owner does not own.
   */
  async assembleFromInputs(
    input: {
      ownerId: UserId;
      rawContent: string;
      declaredTagNames: readonly TagName[];
      declaredInternalLinkRefs: readonly InternalLinkRefType[];
    },
    deps: {
      sanitizer: HtmlSanitizer;
      tagRepo: TagRepository;
      blacklistRepo: TagBlacklistRepository;
      noteRepo: NoteRepository;
      mediaRepo: MediaAssetRepository;
      mintTagId: NoteIdMinter;
      now: Date;
    },
  ): Promise<{
    html: ContentHtml;
    tagIds: readonly TagId[];
    internalLinkRefs: readonly InternalLinkRefType[];
    mediaRefs: readonly MediaAssetId[];
  }> {
    const sanitized = deps.sanitizer.sanitize(input.rawContent, {
      allowMedia: true,
      allowInternalLinks: true,
    });
    const html = sanitized.html;

    const extracted = NoteService.extractMetadataFromHtml(html);

    const mergedTagNames: TagName[] = [];
    const tagSeen = new Set<string>();
    for (const name of input.declaredTagNames) {
      if (tagSeen.has(name)) continue;
      tagSeen.add(name);
      mergedTagNames.push(name);
    }
    for (const name of extracted.tagsFromBody) {
      if (tagSeen.has(name)) continue;
      tagSeen.add(name);
      mergedTagNames.push(name);
    }

    const mergedLinks: InternalLinkRefType[] = [];
    const linkSeen = new Set<string>();
    for (const ref of input.declaredInternalLinkRefs) {
      const key = `${ref.kind}:${ref.target}`;
      if (linkSeen.has(key)) continue;
      linkSeen.add(key);
      mergedLinks.push(ref);
    }
    for (const ref of extracted.internalLinks) {
      const key = `${ref.kind}:${ref.target}`;
      if (linkSeen.has(key)) continue;
      linkSeen.add(key);
      mergedLinks.push(ref);
    }

    const tagIds = await TagService.resolveOrCreate(
      input.ownerId,
      mergedTagNames,
      deps.mintTagId,
      deps.now,
      deps.tagRepo,
      deps.blacklistRepo,
    );

    const resolvedLinks = await NoteService.resolveInternalLinks(
      mergedLinks,
      input.ownerId,
      deps.noteRepo,
    );

    await NoteService.assertMediaOwnership(
      extracted.mediaIds,
      input.ownerId,
      deps.mediaRepo,
    );

    return {
      html,
      tagIds,
      internalLinkRefs: resolvedLinks,
      mediaRefs: extracted.mediaIds,
    };
  },
};
