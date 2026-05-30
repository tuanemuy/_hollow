import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";

const JOB_ERROR_FALLBACK_MESSAGE =
  "取り込みに失敗しました。時間をおいて再度お試しください";

// Generic fallback for business-kind errors whose `code` is not in the
// explicit mapping. Returned in place of the raw `error.message` so that
// internal spec strings / pipeline identifiers never leak to the UI.
// See .issue/221/adr.md ADR-008.
const BUSINESS_FALLBACK_MESSAGE =
  "操作を完了できませんでした。時間をおいて再度お試しください";

// Ingestion business / pipeline codes that may surface to the UI.
// (a) IngestionErrorCode 列挙値（usecase が BusinessRuleError(code) で throw）
// (b) pipeline 識別子（runIngestionJob.ts の classifyPipelineError 由来）
// 2 系統のコード出所を `// ---- ----` で区切る。詳細は .issue/221/adr.md ADR-005。
function renderIngestionBusinessMessage(code: string): string | null {
  switch (code) {
    // ---- (a) IngestionErrorCode 列挙値（usecase が BusinessRuleError(code) で throw） ----
    case "unsupported_format":
      return "このファイル形式には対応していません。HTML / Markdown / Office / PDF / 画像 / 音声 形式でお試しください";
    case "ingestion_byte_size_exceeds_limit":
      return "ファイルサイズが上限を超えています。サイズを下げて再度お試しください";
    case "daily_upload_quota_exceeded":
      return "本日のアップロード上限に達しました。明日以降に再度お試しください";
    case "regeneration_limit_exceeded":
      return "再生成の回数上限に達しました。一度破棄して再アップロードしてください";
    case "invalid_status_for_commit":
    case "invalid_status_for_discard":
    case "invalid_status_for_regeneration":
    case "ingestion_invalid_state_for_retry":
    case "ingestion_invalid_state_for_attach_preview":
    case "ingestion_invalid_state_for_start":
      return "ジョブの状態が変わっています。画面を更新してから再度お試しください";
    case "ingestion_no_temp_storage_for_retry":
      return "再試行に必要なデータが見つかりません。再度アップロードしてください";
    case "ingestion_invalid_mime_type":
    case "ingestion_invalid_file_name":
    case "ingestion_invalid_byte_size":
      return "ファイルが正しく読み取れませんでした。別のファイルでお試しください";
    case "ingestion_missing_saved_note_id":
      return "保存処理が完了していません。しばらくしてから再度お試しください";
    // ---- (b) pipeline 識別子（runIngestionJob.ts の classifyPipelineError 由来） ----
    case "llm_failure":
      return "AIによる要約・構造化に失敗しました。しばらくしてから再試行をお試しください";
    case "ocr_failure":
      return "画像からの文字認識に失敗しました。別のファイルでお試しください";
    case "speech_failure":
      return "音声の文字起こしに失敗しました。別のファイルでお試しください";
    case "pdf_parse_failure":
      return "PDFを解析できませんでした。ファイルが破損していないかご確認ください";
    case "office_parse_failure":
      return "Officeファイルを解析できませんでした。ファイルが破損していないかご確認ください";
    case "ingestion.invalid_state":
      return "ジョブの状態が変わっています。画面を更新してからお試しください";
    case "ingestion.temp_storage":
      return "ファイルの一時保管に失敗しました。再アップロードをお試しください";
    case "ingestion.unknown":
      return "取り込み処理で予期しないエラーが発生しました。時間をおいて再度お試しください";
    default:
      return null;
  }
}

// Directory business codes (`DirectoryErrorCode`) reachable through the
// create / rename / move / delete dialogs. Codes that only fire on internal
// invariant violations (e.g. `directory_invalid_id`, `directory_depth_mismatch`)
// are intentionally left to the fallback so internal spec strings never leak.
// When adding a case here, mirror it in `EXPLICIT_DIRECTORY_CODES` in
// `__tests__/errorDisplay.test.ts` so the group (c) fallback test stays accurate.
function renderDirectoryBusinessMessage(code: string): string | null {
  switch (code) {
    case "directory_name_conflict":
      return "同名のディレクトリが既に存在します";
    case "directory_too_deep":
      return "ディレクトリの階層が深すぎます（最大10階層まで）";
    case "directory_name_forbidden_character":
      return "使用できない文字が含まれています";
    case "directory_name_empty":
      return "ディレクトリ名を入力してください";
    case "directory_name_too_long":
      return "ディレクトリ名が長すぎます（80文字以内で入力してください）";
    case "directory_cyclic_move":
      return "移動先が不正です。自分自身またはその子孫には移動できません";
    case "cannot_rename_root":
      return "ルートディレクトリの名前は変更できません";
    case "cannot_delete_root":
      return "ルートディレクトリは削除できません";
    case "cannot_move_root":
      return "ルートディレクトリは移動できません";
    default:
      return null;
  }
}

// Identity value-object construction failures (`IdentityErrorCode`) that may
// reach the UI through the auth forms. These are transport-passing business
// invariants (character set, reserved word, password variety, length) that
// the value-object factories enforce — Zod intentionally does not duplicate
// them (see .issue/201/adr.md ADR-003). Mapping them here avoids the generic
// business fallback so the summary tells the user what to fix. They are not
// converted into field-bound validation errors (that would split the 2-point
// validation contract); only `username_taken` / `email_taken` are field-bound,
// and that conversion happens in the usecase layer, not here.
// When adding a case, mirror it in `EXPLICIT_IDENTITY_CODES` in
// `__tests__/errorDisplay.test.ts` so the group (c) fallback test stays accurate.
function renderIdentityBusinessMessage(code: string): string | null {
  switch (code) {
    case "username_invalid":
      return "ユーザー名は英数字とハイフンのみ使用できます";
    case "username_too_short":
      return "ユーザー名が短すぎます";
    case "username_too_long":
      return "ユーザー名が長すぎます";
    case "username_reserved":
      return "このユーザー名は使用できません";
    case "email_invalid":
      return "メールアドレスの形式が正しくありません";
    case "email_too_long":
      return "メールアドレスが長すぎます";
    case "password_too_short":
      return "パスワードが短すぎます";
    case "password_too_long":
      return "パスワードが長すぎます";
    case "password_insufficient_variety":
      return "パスワードは英字と数字を組み合わせてください";
    case "display_name_too_long":
      return "表示名が長すぎます";
    default:
      return null;
  }
}

function renderBusinessMessage(code: string | null): string {
  if (code === null) return BUSINESS_FALLBACK_MESSAGE;
  switch (code) {
    case "FRONT_MATTER_JSON_INVALID":
      return "FrontMatter の JSON が不正です。形式を確認してください";
  }
  const ingestionMessage = renderIngestionBusinessMessage(code);
  if (ingestionMessage !== null) return ingestionMessage;
  const directoryMessage = renderDirectoryBusinessMessage(code);
  if (directoryMessage !== null) return directoryMessage;
  const identityMessage = renderIdentityBusinessMessage(code);
  if (identityMessage !== null) return identityMessage;
  return BUSINESS_FALLBACK_MESSAGE;
}

function renderConflictMessage(code: string | null): string {
  switch (code) {
    case "OPTIMISTIC_LOCK_FAILURE":
      return "他の操作と競合しました。もう一度お試しください";
    case "UNIQUE_VIOLATION":
      return "すでに登録されています";
    case "FOREIGN_KEY_VIOLATION":
      return "依存関係があるため操作できません";
    case "CONSTRAINT_VIOLATION":
      return "データの形式に問題があります。入力を見直してください";
    default:
      return "他の操作と競合しました。もう一度お試しください";
  }
}

function formatFieldErrors(
  fieldErrors: Readonly<Record<string, readonly string[]>>,
): string | null {
  const parts: string[] = [];
  for (const messages of Object.values(fieldErrors)) {
    const first = messages[0];
    if (first === undefined) continue;
    // フィールドキー（英語）は露出せずメッセージのみを結合する。フィールドと
    // メッセージの紐付けは各フォームの field 直下表示（fieldErrorOf）が担う。
    parts.push(first);
  }
  return parts.length > 0 ? parts.join(" / ") : null;
}

export function renderErrorMessage(error: SerializedError): string {
  switch (error.kind) {
    case "business":
      return renderBusinessMessage(error.code);
    case "notFound":
      return "対象が見つかりません";
    case "conflict":
      return renderConflictMessage(error.code);
    case "unauthorized":
      return "認証が必要です";
    case "forbidden":
      return "権限がありません";
    case "validation": {
      if (error.fieldErrors !== undefined) {
        const formatted = formatFieldErrors(error.fieldErrors);
        if (formatted !== null) return formatted;
      }
      return error.message;
    }
    case "system":
      return "システムエラーが発生しました";
    case "unknown":
      return "エラーが発生しました";
  }
}

export function displayError(error: unknown): string {
  return renderErrorMessage(extractSerializedError(error));
}

/**
 * Maps an `IngestionJobWire.errorCode` (raw business code or pipeline
 * identifier stored on a failed job row) to a user-facing message.
 *
 * Returns `null` for `null` input so callers can suppress the UI
 * affordance when no error is attached. Falls back to a neutral retry
 * message when the code is unknown — internal codes never leak to the
 * user.
 */
export function displayJobErrorCode(code: string | null): string | null {
  if (code === null) return null;
  const mapped = renderIngestionBusinessMessage(code);
  if (mapped !== null) return mapped;
  return JOB_ERROR_FALLBACK_MESSAGE;
}

export function sanitizeRouteError(error: unknown): string {
  if (import.meta.env.DEV) {
    console.error("Route error:", error);
  } else {
    console.error("Route error");
  }
  return renderErrorMessage(extractSerializedError(error));
}
