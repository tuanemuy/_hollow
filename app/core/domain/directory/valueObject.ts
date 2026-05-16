import { BusinessRuleError } from "@/core/domain/error";
import { DirectoryErrorCode } from "./errorCode";

const DIRECTORY_NAME_MAX_LENGTH = 80;
const FORBIDDEN_NAME_CHARS = /[/\\<>:|?*\0]/;

declare const directoryIdBrand: unique symbol;
declare const directoryNameBrand: unique symbol;
declare const directorySlugBrand: unique symbol;
declare const directoryPathBrand: unique symbol;
declare const directoryDepthBrand: unique symbol;

export type DirectoryId = string & { readonly [directoryIdBrand]: true };

// Domain treats the id as an opaque, non-empty string; format (UUIDv7) is
// owned by `IdGenerator` and re-validated by storage adapters.
export const DirectoryId = {
  create: (id: string): DirectoryId => {
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        DirectoryErrorCode.InvalidId,
        "Invalid directory id",
      );
    }
    return trimmed as DirectoryId;
  },
};

export type DirectoryName = string & { readonly [directoryNameBrand]: true };

// The root directory carries an empty `DirectoryName`; non-root creation
// goes through the public factory which rejects empty values. The
// `forRoot` factory is the only legitimate construction site for the
// empty-string variant.
export const DirectoryName = {
  create: (raw: string): DirectoryName => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        DirectoryErrorCode.NameEmpty,
        "Directory name cannot be empty",
      );
    }
    if (trimmed.length > DIRECTORY_NAME_MAX_LENGTH) {
      throw new BusinessRuleError(
        DirectoryErrorCode.NameTooLong,
        `Directory name exceeds maximum length (${DIRECTORY_NAME_MAX_LENGTH})`,
      );
    }
    if (FORBIDDEN_NAME_CHARS.test(trimmed)) {
      throw new BusinessRuleError(
        DirectoryErrorCode.NameForbiddenCharacter,
        "Directory name contains forbidden character",
      );
    }
    return trimmed as DirectoryName;
  },

  /**
   * Root-only constructor. Roots are virtual containers with an empty
   * display name; user-facing creation never reaches this path.
   */
  forRoot: (): DirectoryName => "" as DirectoryName,

  /** Case-insensitive equality used for sibling-name uniqueness checks. */
  equals: (a: DirectoryName, b: DirectoryName): boolean =>
    a.toLowerCase() === b.toLowerCase(),
};

export type DirectorySlug = string & { readonly [directorySlugBrand]: true };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// `slug` is a kebab-case URL fragment derived from `name`. The root
// directory carries an empty slug; non-root values must match
// `SLUG_PATTERN`.
export const DirectorySlug = {
  create: (raw: string): DirectorySlug => {
    if (raw.length === 0 || SLUG_PATTERN.test(raw)) {
      return raw as DirectorySlug;
    }
    throw new BusinessRuleError(
      DirectoryErrorCode.InvalidSlug,
      `Invalid directory slug: ${raw}`,
    );
  },

  forRoot: (): DirectorySlug => "" as DirectorySlug,

  /**
   * Kebab-case slug derivation: ASCII-fold lowercased input and collapse
   * non-alphanumeric runs into single dashes. Returns the root sentinel
   * (empty string) when nothing survives normalization so callers can
   * decide whether that is acceptable for their context.
   */
  fromName: (name: DirectoryName): DirectorySlug => {
    const slug = name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return slug as DirectorySlug;
  },
};

export type DirectoryDepth = number & { readonly [directoryDepthBrand]: true };

export const MAX_DIRECTORY_DEPTH = 10;

// Depth is bounded `[0, MAX_DIRECTORY_DEPTH]`. Root sits at 0; every
// move / create that would push a node past the cap throws via
// `DirectoryErrorCode.TooDeep`.
export const DirectoryDepth = {
  root: (): DirectoryDepth => 0 as DirectoryDepth,

  create: (raw: number): DirectoryDepth => {
    if (!Number.isInteger(raw) || raw < 0) {
      throw new BusinessRuleError(
        DirectoryErrorCode.DepthMismatch,
        `Invalid directory depth: ${raw}`,
      );
    }
    if (raw > MAX_DIRECTORY_DEPTH) {
      throw new BusinessRuleError(
        DirectoryErrorCode.TooDeep,
        `Directory depth exceeds maximum (${MAX_DIRECTORY_DEPTH})`,
      );
    }
    return raw as DirectoryDepth;
  },

  next: (d: DirectoryDepth): DirectoryDepth => {
    const candidate = (d as number) + 1;
    if (candidate > MAX_DIRECTORY_DEPTH) {
      throw new BusinessRuleError(
        DirectoryErrorCode.TooDeep,
        `Directory depth exceeds maximum (${MAX_DIRECTORY_DEPTH})`,
      );
    }
    return candidate as DirectoryDepth;
  },
};

export type DirectoryPath = string & { readonly [directoryPathBrand]: true };

// Read-only `/`-delimited path projection. Persistent storage keeps
// `parentId`; this VO is rebuilt by `DirectoryService.computePath` for
// display contexts.
export const DirectoryPath = {
  root: (): DirectoryPath => "/" as DirectoryPath,

  fromSegments: (segments: readonly DirectorySlug[]): DirectoryPath => {
    if (segments.length === 0) {
      return "/" as DirectoryPath;
    }
    return `/${segments.join("/")}` as DirectoryPath;
  },
};
