import { BusinessRuleError } from "@/core/domain/error";
import { PublicationErrorCode } from "./errorCode";

const SHARE_LINK_PASSWORD_MIN_LENGTH = 8;
const SHARE_LINK_PASSWORD_MAX_LENGTH = 128;

declare const shareLinkIdBrand: unique symbol;
declare const shareLinkTokenHashBrand: unique symbol;

/**
 * Opaque, non-empty share-link identifier. As with other ids in the
 * domain, the format (UUIDv7 in this template) is the `IdGenerator`'s
 * concern; the domain only enforces non-emptiness.
 */
export type ShareLinkId = string & { readonly [shareLinkIdBrand]: true };

export const ShareLinkId = {
  create: (id: string): ShareLinkId => {
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        PublicationErrorCode.InvalidShareLinkId,
        "Invalid share link id",
      );
    }
    return trimmed as ShareLinkId;
  },
};

/**
 * Opaque hash of a share-link token. The raw token only ever exists in
 * the issuing response; storage and lookup are keyed off the hash so a
 * DB compromise cannot reveal live tokens.
 */
export type ShareLinkTokenHash = string & {
  readonly [shareLinkTokenHashBrand]: true;
};

export const ShareLinkTokenHash = {
  create: (raw: string): ShareLinkTokenHash => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        PublicationErrorCode.InvalidTokenHash,
        "Share link token hash cannot be empty",
      );
    }
    return trimmed as ShareLinkTokenHash;
  },
};

/**
 * Three-state visibility for a note. `private` is the default; `unlisted`
 * is reachable only via a valid share link; `public` is enumerable.
 */
export type PublicationVisibility = "private" | "unlisted" | "public";

export const PublicationVisibility = {
  create: (raw: string): PublicationVisibility => {
    if (raw !== "private" && raw !== "unlisted" && raw !== "public") {
      throw new BusinessRuleError(
        PublicationErrorCode.InvalidVisibility,
        `Invalid publication visibility: ${raw}`,
      );
    }
    return raw;
  },
};

/**
 * Share-link lifecycle state. `active` links may be opened (subject to
 * password / lockout policy); `revoked` is terminal — re-activation is
 * not permitted.
 */
export type ShareLinkStatus = "active" | "revoked";

export const ShareLinkStatus = {
  create: (raw: string): ShareLinkStatus => {
    if (raw !== "active" && raw !== "revoked") {
      throw new BusinessRuleError(
        PublicationErrorCode.InvalidShareLinkStatus,
        `Invalid share link status: ${raw}`,
      );
    }
    return raw;
  },
};

/**
 * Transient validated share-link password. Lives only in memory between
 * input and hashing; never persisted in raw form. Length 8..128 — same
 * shape rules as `RawPassword` in identity but a separate brand so the
 * two cannot be mixed.
 */
declare const shareLinkPasswordBrand: unique symbol;

export type ShareLinkPassword = string & {
  readonly [shareLinkPasswordBrand]: true;
};

export const ShareLinkPassword = {
  MIN_LENGTH: SHARE_LINK_PASSWORD_MIN_LENGTH,
  MAX_LENGTH: SHARE_LINK_PASSWORD_MAX_LENGTH,
  create: (raw: string): ShareLinkPassword => {
    if (raw.length < SHARE_LINK_PASSWORD_MIN_LENGTH) {
      throw new BusinessRuleError(
        PublicationErrorCode.ShareLinkPasswordTooShort,
        `Share link password must be at least ${SHARE_LINK_PASSWORD_MIN_LENGTH} characters`,
      );
    }
    if (raw.length > SHARE_LINK_PASSWORD_MAX_LENGTH) {
      throw new BusinessRuleError(
        PublicationErrorCode.ShareLinkPasswordTooLong,
        `Share link password must be at most ${SHARE_LINK_PASSWORD_MAX_LENGTH} characters`,
      );
    }
    return raw as ShareLinkPassword;
  },
};

/**
 * Non-negative integer counter for consecutive password-verification
 * failures on a share link. Validates at construction so arithmetic
 * sites cannot produce a negative value.
 */
export function validateFailedAttempts(raw: number): number {
  if (!Number.isInteger(raw) || raw < 0) {
    throw new BusinessRuleError(
      PublicationErrorCode.InvalidFailedAttempts,
      `Invalid failedAttempts: ${raw}`,
    );
  }
  return raw;
}
