import { describe, expect, it } from "vitest";
import { SecretBoxErrorCode } from "@/core/domain/adminSettings/ports/secretBox";
import { DirectoryErrorCode } from "@/core/domain/directory/errorCode";
import { IdentityErrorCode } from "@/core/domain/identity/errorCode";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import {
  displayError,
  displayJobErrorCode,
  renderErrorMessage,
} from "../errorDisplay";

// (a) IngestionErrorCode values that the usecase layer is allowed to
// surface via `BusinessRuleError(code)`. These MUST have an explicit
// Japanese mapping in `displayJobErrorCode` / `renderBusinessMessage`.
const EXPLICIT_INGESTION_CODES: readonly string[] = [
  "unsupported_format",
  "ingestion_byte_size_exceeds_limit",
  "daily_upload_quota_exceeded",
  "regeneration_limit_exceeded",
  "invalid_status_for_commit",
  "invalid_status_for_discard",
  "invalid_status_for_regeneration",
  "ingestion_invalid_state_for_retry",
  "ingestion_invalid_state_for_attach_preview",
  "ingestion_invalid_state_for_start",
  "ingestion_no_temp_storage_for_retry",
  "ingestion_invalid_mime_type",
  "ingestion_invalid_file_name",
  "ingestion_invalid_byte_size",
  "ingestion_missing_saved_note_id",
];

// (b) Pipeline identifiers written to `job.errorCode` by
// `runIngestionJob.classifyPipelineError` — not part of the
// `IngestionErrorCode` enum but still required to map to user text.
const PIPELINE_IDENTIFIERS: readonly string[] = [
  "llm_failure",
  "ocr_failure",
  "speech_failure",
  "pdf_parse_failure",
  "office_parse_failure",
  "ingestion.invalid_state",
  "ingestion.temp_storage",
  "ingestion.unknown",
];

const FALLBACK_MESSAGE =
  "取り込みに失敗しました。時間をおいて再度お試しください";

describe("displayJobErrorCode", () => {
  it("returns null for null input", () => {
    expect(displayJobErrorCode(null)).toBeNull();
  });

  it("returns the neutral fallback (never the raw code) for unknown codes", () => {
    const result = displayJobErrorCode("__some_unknown_code__");
    expect(result).toBe(FALLBACK_MESSAGE);
    // The raw code must never leak into the rendered string.
    expect(result).not.toContain("__some_unknown_code__");
  });

  it.each(
    EXPLICIT_INGESTION_CODES,
  )("maps explicit IngestionErrorCode %s to a Japanese message", (code) => {
    const message = displayJobErrorCode(code);
    expect(message).not.toBeNull();
    expect(message).not.toBe(FALLBACK_MESSAGE);
    // Mapped messages must not leak the raw internal code.
    expect(message ?? "").not.toContain(code);
  });

  it.each(
    PIPELINE_IDENTIFIERS,
  )("maps pipeline identifier %s to a Japanese message", (code) => {
    const message = displayJobErrorCode(code);
    expect(message).not.toBeNull();
    expect(message).not.toBe(FALLBACK_MESSAGE);
    expect(message ?? "").not.toContain(code);
  });

  // (c) value-object 構築時エラー等、UI に届かない前提で fallback 許容するグループ。
  // EXPLICIT_INGESTION_CODES の差分が fallback を返すことだけ確認する
  // （内部 code を含まないことが最終防衛線）。
  it("returns the generic fallback for value-object construction codes (group (c)) so internal codes never leak to the UI", () => {
    const allValues = Object.values(IngestionErrorCode);
    const explicitSet = new Set(EXPLICIT_INGESTION_CODES);
    const fallbackGroup = allValues.filter((v) => !explicitSet.has(v));
    expect(fallbackGroup.length).toBeGreaterThan(0);
    for (const code of fallbackGroup) {
      const message = displayJobErrorCode(code);
      expect(message).toBe(FALLBACK_MESSAGE);
      expect(message).not.toContain(code);
    }
  });
});

describe("renderErrorMessage business mapping", () => {
  it.each(
    EXPLICIT_INGESTION_CODES,
  )("produces a user-facing string for business kind code %s without leaking the code", (code) => {
    const message = renderErrorMessage({
      kind: "business",
      code,
      message: code,
    });
    // The raw code (which we deliberately used as `message`) must not be
    // what the UI sees.
    expect(message).not.toBe(code);
    expect(message).not.toContain(code);
  });

  it.each(
    PIPELINE_IDENTIFIERS,
  )("produces a user-facing string for business kind pipeline identifier %s", (code) => {
    const message = renderErrorMessage({
      kind: "business",
      code,
      message: code,
    });
    expect(message).not.toBe(code);
    expect(message).not.toContain(code);
  });

  it("still maps FRONT_MATTER_JSON_INVALID to the dedicated message", () => {
    const message = renderErrorMessage({
      kind: "business",
      code: "FRONT_MATTER_JSON_INVALID",
      message: "FRONT_MATTER_JSON_INVALID",
    });
    expect(message).toContain("FrontMatter");
  });

  it("returns a generic message and never leaks the raw business message for unknown codes", () => {
    const internalMessage = "internal spec literal: foo_bar_baz";
    const message = renderErrorMessage({
      kind: "business",
      code: "__unknown_business_code__",
      message: internalMessage,
    });
    expect(message).not.toContain(internalMessage);
    expect(message).not.toContain("__unknown_business_code__");
    expect(message).toBe(
      "操作を完了できませんでした。時間をおいて再度お試しください",
    );
  });

  it("returns the generic message when business code is null", () => {
    const message = renderErrorMessage({
      kind: "business",
      code: null,
      message: "ignored internal message",
    });
    expect(message).toBe(
      "操作を完了できませんでした。時間をおいて再度お試しください",
    );
  });
});

// Directory business codes reachable through the directory dialogs. These
// MUST map to a dedicated Japanese message rather than the generic business
// fallback. (Issue #290)
//
// Listed by `DirectoryErrorCode` member (not raw strings) so a typo cannot
// silently desync this list from the enum, and so the `satisfies` below
// type-errors if a referenced member is removed. When `renderDirectoryBusinessMessage`
// gains a new explicit code, add the matching member here too — group (c)
// below then proves every remaining enum value still falls back.
const EXPLICIT_DIRECTORY_CODES = [
  DirectoryErrorCode.NameConflict,
  DirectoryErrorCode.TooDeep,
  DirectoryErrorCode.NameForbiddenCharacter,
  DirectoryErrorCode.NameEmpty,
  DirectoryErrorCode.NameTooLong,
  DirectoryErrorCode.CyclicMove,
  DirectoryErrorCode.CannotRenameRoot,
  DirectoryErrorCode.CannotDeleteRoot,
  DirectoryErrorCode.CannotMoveRoot,
] as const satisfies readonly string[];

const BUSINESS_FALLBACK_MESSAGE =
  "操作を完了できませんでした。時間をおいて再度お試しください";

describe("renderErrorMessage directory business mapping", () => {
  it.each(
    EXPLICIT_DIRECTORY_CODES,
  )("maps directory business code %s to a dedicated message without leaking the code", (code) => {
    const message = renderErrorMessage({
      kind: "business",
      code,
      message: code,
    });
    expect(message).not.toBe(BUSINESS_FALLBACK_MESSAGE);
    expect(message).not.toBe(code);
    expect(message).not.toContain(code);
  });

  it("maps the sibling-name conflict to the user-facing message", () => {
    const message = renderErrorMessage({
      kind: "business",
      code: DirectoryErrorCode.NameConflict,
      message: 'Sibling directory named "docs" already exists',
    });
    expect(message).toBe("同名のディレクトリが既に存在します");
  });

  // Internal-invariant directory codes (not reachable from normal user input)
  // fall back to the generic message so internal spec strings never leak.
  it("returns the generic fallback for internal directory codes (group (c))", () => {
    const allValues = Object.values(DirectoryErrorCode);
    const explicitSet = new Set<string>(EXPLICIT_DIRECTORY_CODES);
    const fallbackGroup = allValues.filter((v) => !explicitSet.has(v));
    expect(fallbackGroup.length).toBeGreaterThan(0);
    for (const code of fallbackGroup) {
      const message = renderErrorMessage({
        kind: "business",
        code,
        message: code,
      });
      expect(message).toBe(BUSINESS_FALLBACK_MESSAGE);
      expect(message).not.toContain(code);
    }
  });
});

// Identity value-object construction business codes reachable through the
// auth forms (#201). These MUST map to a dedicated Japanese message rather
// than the generic business fallback so the summary tells the user what to
// fix. `username_taken` / `email_taken` are intentionally NOT listed: they
// are converted to field-bound validation errors in the usecase layer, so
// they never reach `renderBusinessMessage` as a business kind — they stay in
// the group (c) fallback set here, which proves they would fall back if they
// ever did surface as business.
const EXPLICIT_IDENTITY_CODES = [
  IdentityErrorCode.InvalidUsername,
  IdentityErrorCode.UsernameTooShort,
  IdentityErrorCode.UsernameTooLong,
  IdentityErrorCode.UsernameReserved,
  IdentityErrorCode.InvalidEmail,
  IdentityErrorCode.EmailTooLong,
  IdentityErrorCode.PasswordTooShort,
  IdentityErrorCode.PasswordTooLong,
  IdentityErrorCode.PasswordInsufficientVariety,
  IdentityErrorCode.DisplayNameTooLong,
] as const satisfies readonly string[];

describe("renderErrorMessage identity business mapping", () => {
  it.each(
    EXPLICIT_IDENTITY_CODES,
  )("maps identity business code %s to a dedicated message without leaking the code", (code) => {
    const message = renderErrorMessage({
      kind: "business",
      code,
      message: code,
    });
    expect(message).not.toBe(BUSINESS_FALLBACK_MESSAGE);
    expect(message).not.toBe(code);
    expect(message).not.toContain(code);
  });

  // Remaining identity codes (internal invariants, taken codes converted to
  // validation upstream, token/state codes) fall back to the generic message
  // so internal spec strings never leak.
  it("returns the generic fallback for the remaining identity codes (group (c))", () => {
    const allValues = Object.values(IdentityErrorCode);
    const explicitSet = new Set<string>(EXPLICIT_IDENTITY_CODES);
    const fallbackGroup = allValues.filter((v) => !explicitSet.has(v));
    expect(fallbackGroup.length).toBeGreaterThan(0);
    for (const code of fallbackGroup) {
      const message = renderErrorMessage({
        kind: "business",
        code,
        message: code,
      });
      expect(message).toBe(BUSINESS_FALLBACK_MESSAGE);
      expect(message).not.toContain(code);
    }
  });
});

// W-P-001: SecretBox failures reach the UI only through admin-gated
// operations. Every `SecretBoxErrorCode` value must render a recovery-oriented
// Japanese message and must never echo the raw (env-var-bearing) message.
describe("renderErrorMessage secretBox mapping", () => {
  it("maps KeyUnavailable to a message naming the previous-key recovery path", () => {
    const message = renderErrorMessage({
      kind: "secretBox",
      code: SecretBoxErrorCode.KeyUnavailable,
      message: "SECRET_BOX_MASTER_KEY_PREVIOUS env is not set",
    });
    expect(message).toContain("SECRET_BOX_MASTER_KEY_PREVIOUS");
    expect(message).toContain("旧鍵を設定");
  });

  it.each([
    SecretBoxErrorCode.DecryptFailed,
    SecretBoxErrorCode.InvalidCiphertext,
    SecretBoxErrorCode.EncryptFailed,
  ])("maps crypto failure code %s to a cause-hinting message without echoing the raw message", (code) => {
    const internalMessage = "internal: failed with env SECRET_BOX_MASTER_KEY";
    const message = renderErrorMessage({
      kind: "secretBox",
      code,
      message: internalMessage,
    });
    expect(message).not.toBe(internalMessage);
    expect(message).not.toContain(internalMessage);
    expect(message).toContain("鍵");
  });

  it("renders a non-empty message for every SecretBoxErrorCode value", () => {
    for (const code of Object.values(SecretBoxErrorCode)) {
      const message = renderErrorMessage({
        kind: "secretBox",
        code,
        message: code,
      });
      expect(message.length).toBeGreaterThan(0);
    }
  });
});

describe("renderErrorMessage validation field-error formatting", () => {
  it("joins only the messages (never the field keys) with a separator", () => {
    const message = renderErrorMessage({
      kind: "validation",
      code: "INVALID_INPUT",
      message: "Invalid input",
      fieldErrors: {
        username: ["ユーザー名を入力してください。"],
        email: ["メールアドレスの形式が正しくありません。"],
      },
    });
    expect(message).toBe(
      "ユーザー名を入力してください。 / メールアドレスの形式が正しくありません。",
    );
    // The English field keys must not leak into the summary.
    expect(message).not.toContain("username");
    expect(message).not.toContain("email");
  });

  it("falls back to the error message when fieldErrors is empty", () => {
    const message = renderErrorMessage({
      kind: "validation",
      code: "INVALID_INPUT",
      message: "Invalid input",
      fieldErrors: {},
    });
    expect(message).toBe("Invalid input");
  });
});

describe("displayError happy path", () => {
  it("renders a user-facing message for plain Error (treated as unknown kind)", () => {
    expect(displayError(new Error("boom"))).toBe("エラーが発生しました");
  });

  it("renders the mapped business message for an AppServerError-shaped object", () => {
    const wrapped = {
      serialized: {
        kind: "business" as const,
        code: "unsupported_format",
        message: "unsupported_format",
      },
    };
    const message = displayError(wrapped);
    expect(message).toContain("このファイル形式には対応していません");
    expect(message).not.toContain("unsupported_format");
  });
});
