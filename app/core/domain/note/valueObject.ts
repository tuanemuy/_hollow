import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { NoteErrorCode } from "./errorCode";

declare const noteIdBrand: unique symbol;
declare const noteRevisionIdBrand: unique symbol;
declare const noteSlugBrand: unique symbol;
declare const noteTitleBrand: unique symbol;
declare const contentHtmlBrand: unique symbol;
declare const contentMdBrand: unique symbol;
declare const frontMatterBrand: unique symbol;

const NOTE_SLUG_MAX_LENGTH = 120;
const NOTE_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const NOTE_TITLE_MAX_LENGTH = 200;
const CONTENT_HTML_MAX_BYTES = 1024 * 1024; // 1 MiB
const FRONT_MATTER_MAX_BYTES = 64 * 1024; // 64 KiB
const FRONT_MATTER_MAX_DEPTH = 3;
const FRONT_MATTER_KEY_PATTERN = /^[\x20-\x7E]+$/;
const INTERNAL_LINK_TITLE_MAX_LENGTH = 200;
const UUID_V7_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EDIT_LOCK_MAX_TTL_SECONDS = 30 * 60; // 30 minutes

/**
 * Opaque, non-empty note identifier. Domain treats this as a string; the
 * id format (UUIDv7 in this template) is owned by `IdGenerator` and is
 * re-validated by storage adapters on rehydration.
 */
export type NoteId = string & { readonly [noteIdBrand]: true };

export const NoteId = {
  create: (id: string): NoteId => {
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(NoteErrorCode.InvalidId, "Invalid note id");
    }
    return trimmed as NoteId;
  },
};

/**
 * Opaque, non-empty NoteRevision identifier. Mirrors `NoteId` — the id
 * format (UUIDv7 in this template) is owned by `IdGenerator` and is
 * re-validated by storage adapters on rehydration.
 */
export type NoteRevisionId = string & { readonly [noteRevisionIdBrand]: true };

export const NoteRevisionId = {
  create: (id: string): NoteRevisionId => {
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        NoteErrorCode.InvalidRevisionId,
        "Invalid note revision id",
      );
    }
    return trimmed as NoteRevisionId;
  },
};

/**
 * URL-safe slug for a note. 1..120 characters, must match
 * `[a-z0-9][a-z0-9-]*`. Uniqueness within an owner is enforced via
 * `NoteService.assertSlugUnique`.
 */
export type NoteSlug = string & { readonly [noteSlugBrand]: true };

export const NoteSlug = {
  create: (raw: string): NoteSlug => {
    if (raw.length === 0) {
      throw new BusinessRuleError(
        NoteErrorCode.SlugEmpty,
        "Note slug cannot be empty",
      );
    }
    if (raw.length > NOTE_SLUG_MAX_LENGTH) {
      throw new BusinessRuleError(
        NoteErrorCode.SlugTooLong,
        `Note slug exceeds maximum length (${NOTE_SLUG_MAX_LENGTH})`,
      );
    }
    if (!NOTE_SLUG_PATTERN.test(raw)) {
      throw new BusinessRuleError(
        NoteErrorCode.InvalidSlug,
        `Invalid note slug: ${raw}`,
      );
    }
    return raw as NoteSlug;
  },
  equals: (a: NoteSlug, b: NoteSlug): boolean => a === b,
};

/**
 * Display title of a note. 1..200 characters (trimmed). Empty input is
 * rejected here — the "無題" fallback for unsaved drafts is applied in
 * the service layer before this factory runs.
 */
export type NoteTitle = string & { readonly [noteTitleBrand]: true };

export const NoteTitle = {
  create: (raw: string): NoteTitle => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        NoteErrorCode.TitleEmpty,
        "Note title cannot be empty",
      );
    }
    if (trimmed.length > NOTE_TITLE_MAX_LENGTH) {
      throw new BusinessRuleError(
        NoteErrorCode.TitleTooLong,
        `Note title exceeds maximum length (${NOTE_TITLE_MAX_LENGTH})`,
      );
    }
    return trimmed as NoteTitle;
  },
  equals: (a: NoteTitle, b: NoteTitle): boolean => a === b,
};

/**
 * Sanitised HTML body. The value carries the post-sanitisation contract
 * — every construction site must have already passed the raw input
 * through `HtmlSanitizer`. The factory only checks the byte ceiling
 * (1 MiB); structural / safety checks are the sanitizer's job.
 */
export type ContentHtml = string & { readonly [contentHtmlBrand]: true };

const utf8ByteLength = (value: string): number => {
  // Avoid pulling in `TextEncoder` to keep this pure / runtime-agnostic.
  let bytes = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      bytes += 4;
      i += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
};

export const ContentHtml = {
  create: (raw: string): ContentHtml => {
    if (utf8ByteLength(raw) > CONTENT_HTML_MAX_BYTES) {
      throw new BusinessRuleError(
        NoteErrorCode.ContentTooLarge,
        `Note content exceeds maximum size (${CONTENT_HTML_MAX_BYTES} bytes)`,
      );
    }
    return raw as ContentHtml;
  },
  equals: (a: ContentHtml, b: ContentHtml): boolean => a === b,
};

/**
 * Pre-sanitisation Markdown body. Held briefly between user input and
 * the `MarkdownConverter` → `HtmlSanitizer` pipeline. Validation is
 * intentionally a size guard only.
 */
export type ContentMd = string & { readonly [contentMdBrand]: true };

export const ContentMd = {
  create: (raw: string): ContentMd => {
    if (utf8ByteLength(raw) > CONTENT_HTML_MAX_BYTES) {
      throw new BusinessRuleError(
        NoteErrorCode.ContentTooLarge,
        `Note markdown content exceeds maximum size (${CONTENT_HTML_MAX_BYTES} bytes)`,
      );
    }
    return raw as ContentMd;
  },
};

export type NoteStatus = "active" | "trashed";

export const NoteStatus = {
  create: (raw: string): NoteStatus => {
    if (raw !== "active" && raw !== "trashed") {
      throw new BusinessRuleError(
        NoteErrorCode.InvalidStatus,
        `Invalid note status: ${raw}`,
      );
    }
    return raw;
  },
};

/**
 * Recursive metadata payload extracted from the document FrontMatter.
 * Reflects the YAML/JSON-friendly subset the editor exposes.
 */
export type FrontMatterValue =
  | string
  | number
  | boolean
  | readonly string[]
  | { readonly [key: string]: FrontMatterValue };

export type FrontMatterRecord = { readonly [key: string]: FrontMatterValue };

/**
 * Validated FrontMatter block.
 *
 * Rules enforced at construction:
 * - Top-level keys are ASCII printable (so YAML round-trips are stable).
 * - Nesting depth is bounded by `FRONT_MATTER_MAX_DEPTH` (3).
 * - Serialised JSON size is bounded by `FRONT_MATTER_MAX_BYTES` (64 KiB).
 *
 * The value carries the canonical (post-normalisation) record so
 * equality / hashing can be performed structurally without re-parsing.
 */
export type FrontMatter = FrontMatterRecord & {
  readonly [frontMatterBrand]: true;
};

const isPlainObject = (
  value: unknown,
): value is { readonly [key: string]: unknown } =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

const validateFrontMatterValue = (value: unknown, depth: number): void => {
  if (depth > FRONT_MATTER_MAX_DEPTH) {
    throw new BusinessRuleError(
      NoteErrorCode.FrontMatterTooDeep,
      `FrontMatter exceeds maximum depth (${FRONT_MATTER_MAX_DEPTH})`,
    );
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== "string") {
        throw new BusinessRuleError(
          NoteErrorCode.FrontMatterInvalidValue,
          "FrontMatter array values must be strings",
        );
      }
    }
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (!FRONT_MATTER_KEY_PATTERN.test(key)) {
        throw new BusinessRuleError(
          NoteErrorCode.FrontMatterKeyInvalid,
          `FrontMatter key must be ASCII printable: ${key}`,
        );
      }
      validateFrontMatterValue(child, depth + 1);
    }
    return;
  }
  throw new BusinessRuleError(
    NoteErrorCode.FrontMatterInvalidValue,
    "FrontMatter values must be string / number / boolean / string[] / nested record",
  );
};

export const FrontMatter = {
  empty: (): FrontMatter => ({}) as FrontMatter,

  create: (raw: FrontMatterRecord): FrontMatter => {
    for (const key of Object.keys(raw)) {
      if (!FRONT_MATTER_KEY_PATTERN.test(key)) {
        throw new BusinessRuleError(
          NoteErrorCode.FrontMatterKeyInvalid,
          `FrontMatter key must be ASCII printable: ${key}`,
        );
      }
    }
    validateFrontMatterValue(raw, 1);
    let serialised: string;
    try {
      serialised = JSON.stringify(raw);
    } catch {
      throw new BusinessRuleError(
        NoteErrorCode.FrontMatterInvalidValue,
        "FrontMatter is not JSON-serialisable",
      );
    }
    if (utf8ByteLength(serialised) > FRONT_MATTER_MAX_BYTES) {
      throw new BusinessRuleError(
        NoteErrorCode.FrontMatterTooLarge,
        `FrontMatter exceeds maximum size (${FRONT_MATTER_MAX_BYTES} bytes)`,
      );
    }
    return raw as FrontMatter;
  },

  equals: (a: FrontMatter, b: FrontMatter): boolean => {
    // Structural equality via canonical JSON; FrontMatter is small enough
    // that the stringify cost is negligible and avoids a hand-rolled walk.
    const sortedStringify = (value: unknown): string => {
      if (Array.isArray(value)) {
        return `[${value.map(sortedStringify).join(",")}]`;
      }
      if (isPlainObject(value)) {
        const keys = Object.keys(value).sort();
        return `{${keys
          .map((k) => `${JSON.stringify(k)}:${sortedStringify(value[k])}`)
          .join(",")}}`;
      }
      return JSON.stringify(value);
    };
    return sortedStringify(a) === sortedStringify(b);
  },
};

export type InternalLinkKind = "id" | "title";

/**
 * Reference from a note's body to another note. The reference is captured
 * post-sanitisation so the body keeps its `[[...]]` token while the
 * structured form lives alongside the aggregate. Both kinds carry
 * `resolvedNoteId === null` until `NoteService.resolveInternalLinks`
 * matches them against the owner's catalogue: a title-keyed reference
 * resolves when an active owned note shares the title, an id-keyed
 * reference when the target id points at an active owned note. References
 * with no live owned match stay unresolved (broken link).
 */
export type InternalLinkRef = Readonly<{
  kind: InternalLinkKind;
  target: string;
  resolvedNoteId: NoteId | null;
  displayText: string | null;
}>;

export const InternalLinkRef = {
  create: (params: {
    kind: InternalLinkKind;
    target: string;
    resolvedNoteId?: NoteId | null;
    displayText?: string | null;
  }): InternalLinkRef => {
    if (params.kind !== "id" && params.kind !== "title") {
      throw new BusinessRuleError(
        NoteErrorCode.InternalLinkInvalidKind,
        `Invalid internal link kind: ${params.kind as string}`,
      );
    }
    if (params.kind === "id") {
      if (!UUID_V7_PATTERN.test(params.target)) {
        throw new BusinessRuleError(
          NoteErrorCode.InternalLinkInvalidTarget,
          "Internal link target must be a UUIDv7 when kind=id",
        );
      }
    } else {
      const trimmed = params.target.trim();
      if (
        trimmed.length === 0 ||
        trimmed.length > INTERNAL_LINK_TITLE_MAX_LENGTH
      ) {
        throw new BusinessRuleError(
          NoteErrorCode.InternalLinkInvalidTarget,
          `Internal link target must be 1..${INTERNAL_LINK_TITLE_MAX_LENGTH} characters when kind=title`,
        );
      }
    }
    return {
      kind: params.kind,
      target: params.kind === "title" ? params.target.trim() : params.target,
      resolvedNoteId: params.resolvedNoteId ?? null,
      displayText: params.displayText ?? null,
    };
  },

  equals: (a: InternalLinkRef, b: InternalLinkRef): boolean =>
    a.kind === b.kind && a.target === b.target,

  withResolved: (
    ref: InternalLinkRef,
    resolvedNoteId: NoteId | null,
  ): InternalLinkRef => ({
    ...ref,
    resolvedNoteId,
  }),
};

/**
 * Soft edit lock guarding concurrent updates. Held by a single user for
 * up to `EDIT_LOCK_MAX_TTL_SECONDS` (30 minutes); `Note` aggregate
 * methods consume the lock to authorise edits.
 */
export type EditLock = Readonly<{
  userId: UserId;
  acquiredAt: Date;
  expiresAt: Date;
}>;

export const EditLock = {
  create: (params: {
    userId: UserId;
    acquiredAt: Date;
    expiresAt: Date;
  }): EditLock => {
    if (params.expiresAt.getTime() <= params.acquiredAt.getTime()) {
      throw new BusinessRuleError(
        NoteErrorCode.EditLockInvalidExpiry,
        "EditLock expiresAt must be after acquiredAt",
      );
    }
    const ttlMs = params.expiresAt.getTime() - params.acquiredAt.getTime();
    if (ttlMs > EDIT_LOCK_MAX_TTL_SECONDS * 1000) {
      throw new BusinessRuleError(
        NoteErrorCode.EditLockTtlTooLong,
        `EditLock TTL exceeds maximum (${EDIT_LOCK_MAX_TTL_SECONDS}s)`,
      );
    }
    return {
      userId: params.userId,
      acquiredAt: params.acquiredAt,
      expiresAt: params.expiresAt,
    };
  },

  /** Lock is still in force at `now` (not expired). */
  isLive: (lock: EditLock, now: Date): boolean =>
    lock.expiresAt.getTime() > now.getTime(),

  equals: (a: EditLock, b: EditLock): boolean =>
    a.userId === b.userId &&
    a.acquiredAt.getTime() === b.acquiredAt.getTime() &&
    a.expiresAt.getTime() === b.expiresAt.getTime(),
};

/** Maximum allowed TTL for an `EditLock`, in seconds. */
export const MAX_EDIT_LOCK_TTL_SECONDS = EDIT_LOCK_MAX_TTL_SECONDS;

/**
 * Half-open date range `[from, to)` used by listing queries. Both bounds
 * are optional — `from === null` is "unbounded below", same for `to`.
 */
export type DateRange = Readonly<{
  from: Date | null;
  to: Date | null;
}>;
