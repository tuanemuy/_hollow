import { BusinessRuleError } from "@/core/domain/error";
import { MediaErrorCode } from "./errorCode";

declare const mediaAssetIdBrand: unique symbol;
declare const mimeTypeBrand: unique symbol;
declare const storageKeyBrand: unique symbol;
declare const originalFileNameBrand: unique symbol;

const MIME_TYPE_MAX_LENGTH = 255;
const STORAGE_KEY_MAX_LENGTH = 1024;
const ORIGINAL_FILE_NAME_MAX_LENGTH = 255;
// Conservative upper bound shared with R2 object limits (5 TiB), expressed
// in bytes. The MVP cap is much lower in practice but the invariant only
// guards against negative / non-integer / pathologically large values.
const BYTE_SIZE_MAX = 5 * 1024 * 1024 * 1024 * 1024;

/**
 * Opaque, non-empty identifier for a media asset. Domain treats this as a
 * string; the id format (UUIDv7 in this template) is the `IdGenerator`'s
 * concern and is re-validated by storage adapters on rehydration.
 */
export type MediaAssetId = string & { readonly [mediaAssetIdBrand]: true };

export const MediaAssetId = {
  create: (id: string): MediaAssetId => {
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidId,
        "Invalid media asset id",
      );
    }
    return trimmed as MediaAssetId;
  },
};

export type MediaKind = "image" | "video" | "avatar" | "source";

export const MediaKind = {
  create: (raw: string): MediaKind => {
    if (
      raw !== "image" &&
      raw !== "video" &&
      raw !== "avatar" &&
      raw !== "source"
    ) {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidKind,
        `Invalid media kind: ${raw}`,
      );
    }
    return raw;
  },
};

/**
 * Concrete storage backend. R2 is the MVP target; `s3` / `github` are
 * left out of the union deliberately so adding them later forces a domain
 * review rather than silently accepting unknown values from storage.
 */
export type StorageBackend = "r2";

export const StorageBackend = {
  create: (raw: string): StorageBackend => {
    if (raw !== "r2") {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidBackend,
        `Invalid storage backend: ${raw}`,
      );
    }
    return raw;
  },
};

export type MediaStatus = "pending" | "attached" | "orphan" | "deleting";

export const MediaStatus = {
  create: (raw: string): MediaStatus => {
    if (
      raw !== "pending" &&
      raw !== "attached" &&
      raw !== "orphan" &&
      raw !== "deleting"
    ) {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidStatus,
        `Invalid media status: ${raw}`,
      );
    }
    return raw;
  },
};

/**
 * Publication visibility as observed from the Media domain. The
 * canonical brand lives in the Publication domain; until it is
 * implemented Media owns this local alias so `assertViewableBy` is still
 * structurally typed. When Publication is implemented, swap this for
 * `import type { Visibility } from "../publication/valueObject"`.
 */
export type Visibility = "private" | "unlisted" | "public";

export const Visibility = {
  create: (raw: string): Visibility => {
    if (raw !== "private" && raw !== "unlisted" && raw !== "public") {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidVisibility,
        `Invalid visibility: ${raw}`,
      );
    }
    return raw;
  },
};

/**
 * IANA media type string (e.g. `image/png`). Validation is intentionally
 * shallow — the storage adapter is responsible for cross-checking against
 * the actual byte stream when it matters.
 */
export type MimeType = string & { readonly [mimeTypeBrand]: true };

export const MimeType = {
  create: (raw: string): MimeType => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidMimeType,
        "Mime type cannot be empty",
      );
    }
    if (trimmed.length > MIME_TYPE_MAX_LENGTH) {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidMimeType,
        `Mime type exceeds maximum length (${MIME_TYPE_MAX_LENGTH})`,
      );
    }
    // Type/Subtype shape only — parameter parsing is left to the adapter.
    if (!/^[\w.+-]+\/[\w.+-]+$/.test(trimmed)) {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidMimeType,
        `Invalid mime type: ${trimmed}`,
      );
    }
    return trimmed as MimeType;
  },
};

/**
 * Storage object key (e.g. `<userId>/<kind>/<id>`). Treated as opaque
 * here — the adapter chooses the exact layout — but kept branded so the
 * adapter cannot be passed an arbitrary string by mistake.
 */
export type StorageKey = string & { readonly [storageKeyBrand]: true };

export const StorageKey = {
  create: (raw: string): StorageKey => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidStorageKey,
        "Storage key cannot be empty",
      );
    }
    if (trimmed.length > STORAGE_KEY_MAX_LENGTH) {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidStorageKey,
        `Storage key exceeds maximum length (${STORAGE_KEY_MAX_LENGTH})`,
      );
    }
    return trimmed as StorageKey;
  },
};

export type OriginalFileName = string & {
  readonly [originalFileNameBrand]: true;
};

export const OriginalFileName = {
  create: (raw: string): OriginalFileName => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidOriginalFileName,
        "Original file name cannot be empty",
      );
    }
    if (trimmed.length > ORIGINAL_FILE_NAME_MAX_LENGTH) {
      throw new BusinessRuleError(
        MediaErrorCode.InvalidOriginalFileName,
        `Original file name exceeds maximum length (${ORIGINAL_FILE_NAME_MAX_LENGTH})`,
      );
    }
    return trimmed as OriginalFileName;
  },
};

/** Validates `byteSize` as a non-negative finite integer within the cap. */
export function validateByteSize(raw: number): number {
  if (!Number.isInteger(raw) || raw < 0 || raw > BYTE_SIZE_MAX) {
    throw new BusinessRuleError(
      MediaErrorCode.InvalidByteSize,
      `Invalid byte size: ${raw}`,
    );
  }
  return raw;
}

/** Validates a pixel dimension as a positive finite integer. */
export function validateDimension(raw: number): number {
  if (!Number.isInteger(raw) || raw <= 0) {
    throw new BusinessRuleError(
      MediaErrorCode.InvalidDimension,
      `Invalid dimension: ${raw}`,
    );
  }
  return raw;
}

/** Validates `durationMs` as a non-negative finite integer. */
export function validateDurationMs(raw: number): number {
  if (!Number.isInteger(raw) || raw < 0) {
    throw new BusinessRuleError(
      MediaErrorCode.InvalidDuration,
      `Invalid duration: ${raw}`,
    );
  }
  return raw;
}

/** Validates `refCount` as a non-negative finite integer. */
export function validateRefCount(raw: number): number {
  if (!Number.isInteger(raw) || raw < 0) {
    throw new BusinessRuleError(
      MediaErrorCode.InvalidRefCount,
      `Invalid ref count: ${raw}`,
    );
  }
  return raw;
}
