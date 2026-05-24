import { BusinessRuleError } from "@/core/domain/error";
import { IdentityErrorCode } from "./errorCode";

declare const userIdBrand: unique symbol;
declare const usernameBrand: unique symbol;
declare const emailAddressBrand: unique symbol;
declare const rawPasswordBrand: unique symbol;
declare const passwordHashBrand: unique symbol;
declare const mediaAssetIdBrand: unique symbol;

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 32;
const USERNAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const USERNAME_RESERVED: ReadonlySet<string> = new Set([
  "admin",
  "api",
  "auth",
  "login",
  "signup",
  "settings",
  "share",
  "static",
  "assets",
]);

const EMAIL_MAX_LENGTH = 254;
// Pragmatic RFC 5322 subset: local@domain with at least one dot in the
// domain part. Full RFC 5322 is intentionally not enforced here — final
// deliverability is validated by the email provider at send time.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_MAX_LENGTH = 128;

const DISPLAY_NAME_MAX_LENGTH = 50;
const BIO_MAX_LENGTH = 500;

/**
 * Opaque, non-empty user identifier. Domain treats this as a string; the
 * id format (UUIDv7 in this template) is the `IdGenerator`'s concern.
 */
export type UserId = string & { readonly [userIdBrand]: true };

export const UserId = {
  create: (id: string): UserId => {
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        IdentityErrorCode.InvalidUserId,
        "Invalid user id",
      );
    }
    return trimmed as UserId;
  },
};

/**
 * URL-safe handle. Lowercase letters / digits / hyphens; cannot start or
 * end with a hyphen; not in the reserved list. Length 3..32.
 */
export type Username = string & { readonly [usernameBrand]: true };

export const Username = {
  create: (raw: string): Username => {
    const trimmed = raw.trim();
    if (trimmed.length < USERNAME_MIN_LENGTH) {
      throw new BusinessRuleError(
        IdentityErrorCode.UsernameTooShort,
        `Username must be at least ${USERNAME_MIN_LENGTH} characters`,
      );
    }
    if (trimmed.length > USERNAME_MAX_LENGTH) {
      throw new BusinessRuleError(
        IdentityErrorCode.UsernameTooLong,
        `Username must be at most ${USERNAME_MAX_LENGTH} characters`,
      );
    }
    if (!USERNAME_PATTERN.test(trimmed)) {
      throw new BusinessRuleError(
        IdentityErrorCode.InvalidUsername,
        "Username must contain only lowercase letters, digits, and hyphens",
      );
    }
    if (USERNAME_RESERVED.has(trimmed)) {
      throw new BusinessRuleError(
        IdentityErrorCode.UsernameReserved,
        `Username "${trimmed}" is reserved`,
      );
    }
    return trimmed as Username;
  },
  equals: (a: Username, b: Username): boolean => a === b,
};

/**
 * Normalised email address (lowercased local + domain). Length capped
 * at 254. Equality is exact string equality after normalisation.
 */
export type EmailAddress = string & { readonly [emailAddressBrand]: true };

export const EmailAddress = {
  create: (raw: string): EmailAddress => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        IdentityErrorCode.InvalidEmail,
        "Email address cannot be empty",
      );
    }
    if (trimmed.length > EMAIL_MAX_LENGTH) {
      throw new BusinessRuleError(
        IdentityErrorCode.EmailTooLong,
        `Email address must be at most ${EMAIL_MAX_LENGTH} characters`,
      );
    }
    const normalised = trimmed.toLowerCase();
    if (!EMAIL_PATTERN.test(normalised)) {
      throw new BusinessRuleError(
        IdentityErrorCode.InvalidEmail,
        "Invalid email address",
      );
    }
    return normalised as EmailAddress;
  },
  equals: (a: EmailAddress, b: EmailAddress): boolean => a === b,
};

/**
 * Validated raw password (12..128, two character classes among
 * letters / digits / symbols). Held only transiently — never persisted.
 */
export type RawPassword = string & { readonly [rawPasswordBrand]: true };

export const RawPassword = {
  create: (raw: string): RawPassword => {
    if (raw.length < PASSWORD_MIN_LENGTH) {
      throw new BusinessRuleError(
        IdentityErrorCode.PasswordTooShort,
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
      );
    }
    if (raw.length > PASSWORD_MAX_LENGTH) {
      throw new BusinessRuleError(
        IdentityErrorCode.PasswordTooLong,
        `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
      );
    }
    const hasLetter = /[A-Za-z]/.test(raw);
    const hasDigit = /[0-9]/.test(raw);
    // Symbol = anything that is not a letter or digit (covers ASCII
    // punctuation as well as unicode symbols).
    const hasSymbol = /[^A-Za-z0-9]/.test(raw);
    const variety =
      (hasLetter ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSymbol ? 1 : 0);
    if (variety < 2) {
      throw new BusinessRuleError(
        IdentityErrorCode.PasswordInsufficientVariety,
        "Password must include at least two of: letters, digits, symbols",
      );
    }
    return raw as RawPassword;
  },
};

/**
 * Encoded password hash (algorithm chosen by the adapter; currently
 * scrypt via `@noble/hashes`). Construction validates only
 * non-emptiness; format details (algorithm parameters) belong to the
 * `CredentialStore` adapter and are not part of the domain contract.
 */
export type PasswordHash = string & { readonly [passwordHashBrand]: true };

export const PasswordHash = {
  create: (raw: string): PasswordHash => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        IdentityErrorCode.InvalidPasswordHash,
        "Password hash cannot be empty",
      );
    }
    return trimmed as PasswordHash;
  },
};

export type UserStatus = "pending" | "active" | "suspended" | "deleted";

export const UserStatus = {
  create: (raw: string): UserStatus => {
    if (
      raw !== "pending" &&
      raw !== "active" &&
      raw !== "suspended" &&
      raw !== "deleted"
    ) {
      throw new BusinessRuleError(
        IdentityErrorCode.InvalidUserStatus,
        `Invalid user status: ${raw}`,
      );
    }
    return raw;
  },
};

export type Role = "member" | "admin";

export const Role = {
  create: (raw: string): Role => {
    if (raw !== "member" && raw !== "admin") {
      throw new BusinessRuleError(
        IdentityErrorCode.InvalidRole,
        `Invalid role: ${raw}`,
      );
    }
    return raw;
  },
};

export type ChallengePurpose =
  | "email_verification"
  | "password_reset"
  | "email_change";

export const ChallengePurpose = {
  create: (raw: string): ChallengePurpose => {
    if (
      raw !== "email_verification" &&
      raw !== "password_reset" &&
      raw !== "email_change"
    ) {
      throw new BusinessRuleError(
        IdentityErrorCode.InvalidChallengePurpose,
        `Invalid challenge purpose: ${raw}`,
      );
    }
    return raw;
  },
};

export type CredentialKind = "password" | "oauth";

export const CredentialKind = {
  create: (raw: string): CredentialKind => {
    if (raw !== "password" && raw !== "oauth") {
      throw new BusinessRuleError(
        IdentityErrorCode.InvalidCredentialKind,
        `Invalid credential kind: ${raw}`,
      );
    }
    return raw;
  },
};

export type CredentialSummary = Readonly<
  | { kind: "password"; createdAt: Date }
  | {
      kind: "oauth";
      providerId: string;
      providerAccountId: string;
      createdAt: Date;
    }
>;

/**
 * Opaque reference to a media asset owned by the Media domain. The Media
 * domain owns the canonical brand; until Media defines its own
 * `MediaAssetId`, Identity imports this local alias so the User
 * aggregate's `avatarMediaId` is still nominally typed. Once Media is
 * implemented, replace `import { MediaAssetId } from "../media/..."`
 * and remove this declaration.
 */
export type MediaAssetId = string & { readonly [mediaAssetIdBrand]: true };

export const MediaAssetId = {
  create: (raw: string): MediaAssetId => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        IdentityErrorCode.InvalidMediaAssetId,
        "Invalid media asset id",
      );
    }
    return trimmed as MediaAssetId;
  },
};

/**
 * Profile display name — free-form 1..50 string. Not branded because
 * there is no domain invariant beyond length: equality and any
 * additional rules live with whatever consumes it.
 */
export const DisplayName = {
  MAX_LENGTH: DISPLAY_NAME_MAX_LENGTH,
  create: (raw: string): string => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        IdentityErrorCode.DisplayNameEmpty,
        "Display name cannot be empty",
      );
    }
    if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
      throw new BusinessRuleError(
        IdentityErrorCode.DisplayNameTooLong,
        `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters`,
      );
    }
    return trimmed;
  },
};

/**
 * Profile bio — free-form 0..500. `null` is the "no bio" sentinel; an
 * empty / whitespace-only input is normalised to `null` so the storage
 * layer holds a single canonical representation.
 */
export const Bio = {
  MAX_LENGTH: BIO_MAX_LENGTH,
  create: (raw: string | null): string | null => {
    if (raw === null) {
      return null;
    }
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (trimmed.length > BIO_MAX_LENGTH) {
      throw new BusinessRuleError(
        IdentityErrorCode.BioTooLong,
        `Bio must be at most ${BIO_MAX_LENGTH} characters`,
      );
    }
    return trimmed;
  },
};
