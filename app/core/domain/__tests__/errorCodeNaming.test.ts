import { describe, expect, it } from "vitest";

// Dynamically enumerate every `*ErrorCode` module declared under
// `app/core/domain/*/errorCode.ts`. Using `import.meta.glob` (Vite/Vitest API)
// avoids per-domain manual imports that risk drifting when a new domain is added.
const errorCodeModules = import.meta.glob<Record<string, unknown>>(
  "../*/errorCode.ts",
  { eager: true },
);

const VALUE_REGEX = /^[a-z][a-z0-9_]*$/;
const KEY_REGEX = /^[A-Z][A-Za-z0-9]*$/;

type ErrorCodeRecord = Record<string, string>;

function pickErrorCodeMap(mod: Record<string, unknown>): {
  name: string;
  map: ErrorCodeRecord;
} | null {
  for (const [exportName, value] of Object.entries(mod)) {
    if (
      !exportName.endsWith("ErrorCode") ||
      typeof value !== "object" ||
      value === null
    ) {
      continue;
    }
    const map = value as Record<string, unknown>;
    const entries = Object.values(map);
    if (entries.length > 0 && entries.every((v) => typeof v === "string")) {
      return { name: exportName, map: map as ErrorCodeRecord };
    }
  }
  return null;
}

const errorCodeMaps = Object.entries(errorCodeModules)
  .map(([path, mod]) => ({ path, picked: pickErrorCodeMap(mod) }))
  .filter(
    (
      entry,
    ): entry is {
      path: string;
      picked: { name: string; map: ErrorCodeRecord };
    } => entry.picked !== null,
  );

// Pinning the expected set guards against glob mis-resolution or accidental
// removal of a domain's errorCode module. Update this list deliberately when a
// new domain is added — that is exactly the point.
const EXPECTED_ERROR_CODE_NAMES = new Set([
  "AdminSettingsErrorCode",
  "DirectoryErrorCode",
  "ExportErrorCode",
  "IdentityErrorCode",
  "IngestionErrorCode",
  "MediaErrorCode",
  "NoteErrorCode",
  "PublicationErrorCode",
  "SearchErrorCode",
  "TagErrorCode",
  "ViewErrorCode",
]);

describe("ErrorCode naming convention", () => {
  it("discovers every expected *ErrorCode module via glob", () => {
    const found = new Set(errorCodeMaps.map((e) => e.picked.name));
    expect(found).toEqual(EXPECTED_ERROR_CODE_NAMES);
  });

  it("validates the value regex itself", () => {
    expect(VALUE_REGEX.test("good_value")).toBe(true);
    expect(VALUE_REGEX.test("v")).toBe(true);
    expect(VALUE_REGEX.test("share_link_revoked")).toBe(true);
    expect(VALUE_REGEX.test("UPPER")).toBe(false);
    expect(VALUE_REGEX.test("UPPER_SNAKE")).toBe(false);
    expect(VALUE_REGEX.test("Mixed_case")).toBe(false);
    expect(VALUE_REGEX.test("0starts_with_digit")).toBe(false);
    expect(VALUE_REGEX.test("_leading_underscore")).toBe(false);
    expect(VALUE_REGEX.test("has-dash")).toBe(false);
    expect(VALUE_REGEX.test("")).toBe(false);
  });

  it("validates the key regex itself", () => {
    expect(KEY_REGEX.test("InvalidId")).toBe(true);
    expect(KEY_REGEX.test("ShareLinkRevoked")).toBe(true);
    expect(KEY_REGEX.test("A")).toBe(true);
    expect(KEY_REGEX.test("invalidId")).toBe(false);
    expect(KEY_REGEX.test("SNAKE_CASE")).toBe(false);
    expect(KEY_REGEX.test("With_Underscore")).toBe(false);
    expect(KEY_REGEX.test("")).toBe(false);
  });

  for (const { path, picked } of errorCodeMaps) {
    describe(`${picked.name} (${path})`, () => {
      for (const [key, value] of Object.entries(picked.map)) {
        it(`key "${key}" is PascalCase`, () => {
          expect(key).toMatch(KEY_REGEX);
        });
        it(`value "${value}" (key="${key}") is lower_snake_case`, () => {
          expect(value).toMatch(VALUE_REGEX);
        });
      }
    });
  }
});
