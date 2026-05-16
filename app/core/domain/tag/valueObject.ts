import { BusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { TagErrorCode } from "./errorCode";

const TAG_NAME_MAX_LENGTH = 50;

declare const tagIdBrand: unique symbol;
declare const tagNameBrand: unique symbol;

/**
 * Tag identifier.
 *
 * As with other aggregate ids in this template, the domain treats the
 * value as an opaque non-empty string. Format (UUIDv7) is owned by
 * `IdGenerator` and validated on rehydration by storage adapters.
 */
export type TagId = string & { readonly [tagIdBrand]: true };

export const TagId = {
  create: (id: string): TagId => {
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(TagErrorCode.InvalidId, "Invalid tag id");
    }
    return trimmed as TagId;
  },
};

/**
 * Tag display/search name.
 *
 * Normalised to NFKC and stripped of a leading `#` so that variants like
 * `#Foo` and `Foo` collapse to the same canonical form for uniqueness
 * checks and body-text replacement.
 *
 * Rules:
 * - 1..50 chars after normalisation
 * - no whitespace / line breaks inside
 * - leading `#` is stripped before length check
 */
export type TagName = string & { readonly [tagNameBrand]: true };

const WHITESPACE_PATTERN = /[\s\r\n]/;

export const TagName = {
  create: (raw: string): TagName => {
    const normalised = raw.normalize("NFKC");
    const withoutHash = normalised.startsWith("#")
      ? normalised.slice(1)
      : normalised;
    if (withoutHash.length === 0) {
      throw new BusinessRuleError(
        TagErrorCode.NameEmpty,
        "Tag name cannot be empty",
      );
    }
    if (WHITESPACE_PATTERN.test(withoutHash)) {
      throw new BusinessRuleError(
        TagErrorCode.NameInvalidChars,
        "Tag name cannot contain whitespace or line breaks",
      );
    }
    if (withoutHash.length > TAG_NAME_MAX_LENGTH) {
      throw new BusinessRuleError(
        TagErrorCode.NameTooLong,
        `Tag name exceeds maximum length (${TAG_NAME_MAX_LENGTH})`,
      );
    }
    return withoutHash as TagName;
  },
  equals: (a: TagName, b: TagName): boolean => a === b,
};

/**
 * Blacklist entry recording that a given tag name was deleted for an
 * owner. Used to suppress automatic re-extraction of the same name
 * from note bodies after deletion.
 *
 * Identity is the `(ownerId, name)` pair; there is no surrogate id.
 */
export type TagBlacklistEntry = Readonly<{
  ownerId: UserId;
  name: TagName;
  addedAt: Date;
}>;

export const TagBlacklistEntry = {
  create: (params: {
    ownerId: UserId;
    name: TagName;
    addedAt: Date;
  }): TagBlacklistEntry => ({
    ownerId: params.ownerId,
    name: params.name,
    addedAt: params.addedAt,
  }),
  equals: (a: TagBlacklistEntry, b: TagBlacklistEntry): boolean =>
    a.ownerId === b.ownerId && TagName.equals(a.name, b.name),
};
