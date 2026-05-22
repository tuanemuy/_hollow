/**
 * Unified error-reason sanitizer for LLM connection-ping and provider
 * response paths. Normalizes an arbitrary `unknown` error value into a
 * fixed category enum plus a secret-masked human-readable message so the
 * admin UI / log layer never surfaces:
 *
 * - Request URLs with query strings (e.g. Azure's `?api-version=...&key=...`).
 * - `Bearer <token>` Authorization headers.
 * - Inline `key=...` / `api_key=...` / `token=...` / `secret=...` /
 *   `password=...` / `authorization=...` segments.
 * - Known provider token prefixes (`sk-...`, `AIza...`).
 *
 * Used by:
 * - `adapters/{anthropic,openai,gemini}/connectionPing.ts` for the full
 *   sanitize (category + masking) on probe failures.
 * - `application/di/llmConnectionTester.ts` for a final masking-only
 *   fallback in the dispatcher (ADR-002 of Issue #141).
 * - `adapters/{anthropic,openai,gemini}/messagesClient.ts` for masking
 *   the `detailSuffix` extracted from provider error bodies. Category
 *   normalization is intentionally skipped there because HTTP-status →
 *   error-class mapping is already handled by each provider's mapper
 *   (ADR-004 of Issue #141).
 *
 * The category enum (`SanitizedErrorReason`) is a UI-display prefix and
 * intentionally lives outside the `*ErrorCode` / `kind`-tagged
 * serialized-form system documented in CLAUDE.md. It is exempt from
 * `errorCodeNaming.test.ts` because it is not an `*ErrorCode`.
 *
 * Idempotency contract:
 * - `sanitizeErrorReason(sanitizeErrorReason(x).message)` returns the
 *   same `message` when re-fed (the `category` may collapse to `unknown`
 *   since the second pass is a plain string, but the message is stable).
 * - `maskSecrets(maskSecrets(x)) === maskSecrets(x)`. The masking
 *   patterns are designed so that an already-masked string survives a
 *   second pass unchanged.
 *
 * See `.issue/141/plan.md` and `.issue/141/adr.md` for the full design
 * rationale.
 */

export type SanitizedErrorReason =
  | "timeout"
  | "network"
  | "auth_failed"
  | "rate_limited"
  | "quota"
  | "server_error"
  | "unknown";

export type SanitizedReasonResult = Readonly<{
  category: SanitizedErrorReason;
  message: string;
}>;

/**
 * Replaces secret-like substrings in `text` with `***` placeholders.
 *
 * Strategy:
 * - URL `https?://...` → keep `origin + pathname`, replace the entire
 *   query with `?…` (one Unicode ellipsis). The whole-query approach is
 *   intentional — see ADR-003: whitelisting known secret-key names risks
 *   missing future unknown keys.
 * - `Bearer <token>` (case-insensitive) → `Bearer ***`.
 * - Inline `key=...` / `api_key=...` / `access_token=...` / `token=...`
 *   / `password=...` / `secret=...` / `authorization=...` segments
 *   (case-insensitive, dash or underscore separator) → value masked.
 * - Known provider token prefixes (`sk-XXX` and `AIzaXXX`) → `***`.
 *
 * A generic "long high-entropy string" pattern is intentionally NOT
 * used: it produces too many false positives on GUIDs, model names
 * (`gpt-4-turbo-preview`), and base64 stack-trace addresses.
 */
export function maskSecrets(text: string): string {
  if (text.length === 0) return text;

  let out = text;

  // 1. Strip query strings off any URL appearing in the message.
  //    Match `https?://` followed by non-whitespace until end-of-string
  //    or whitespace. The replacement extracts origin + pathname only.
  out = out.replace(/https?:\/\/[^\s)<>"']+/gi, (match) => {
    try {
      const u = new URL(match);
      // `u.search` is the leading `?` + query. If absent, leave the URL
      // alone (origin + pathname only). If present, collapse to `?…`.
      const base = `${u.origin}${u.pathname}`;
      return u.search.length > 0 ? `${base}?…` : base;
    } catch {
      // Malformed URL — fall through to inline-key masking below.
      return match;
    }
  });

  // 2. `Bearer <token>` → `Bearer ***`. Token may already be `***`,
  //    in which case the regex matches and re-substitutes the same.
  //    The keyword's original case is preserved by using a callback.
  out = out.replace(
    /\b(Bearer)(\s+)([^\s,;]+)/gi,
    (_match, keyword: string, sep: string) => `${keyword}${sep}***`,
  );

  // 3. Inline `<key>=<value>` segments for known secret-bearing names.
  //    The leading boundary is `^` / `?` / `&` / whitespace / `,` so we
  //    only match query-style or sentence-embedded forms, not arbitrary
  //    substrings inside identifiers.
  out = out.replace(
    /(^|[?&\s,])(key|api[_-]?key|access[_-]?token|token|password|secret|authorization)=([^&\s,]+)/gi,
    (_full, prefix: string, name: string) => `${prefix}${name}=***`,
  );

  // 4. JSON-shape `"key":"value"` segments for known secret-bearing names.
  //    Covers the `JSON.stringify(input)` path in `extractMessage` when an
  //    arbitrary object is passed in and the inline `key=value` regex does
  //    not match (e.g. `{"apiKey":"abc123"}`).
  out = out.replace(
    /"(key|api[_-]?key|access[_-]?token|token|password|secret|authorization)"\s*:\s*"([^"]*)"/gi,
    (_full, name: string) => `"${name}":"***"`,
  );

  // 5. Known provider prefixes appearing standalone in the message text.
  //    - `sk-` family: OpenAI, Anthropic (`sk-ant-...`), and many
  //      OpenAI-compatible providers all use this prefix.
  //    - `AIza`: Google AI Studio / Gemini.
  //    Token chars are limited to `[A-Za-z0-9_-]` and must be at least
  //    8 chars long. `***` itself does not match either prefix, so the
  //    pattern is idempotent.
  out = out.replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "***");
  out = out.replace(/\bAIza[A-Za-z0-9_-]{8,}/g, "***");

  return out;
}

/**
 * Normalizes an arbitrary error-like value into a category + masked
 * message pair. Accepts `Error` instances, plain strings, numbers,
 * `undefined`, `null`, and arbitrary objects without throwing.
 *
 * Category selection priority:
 *  1. `AbortError` (DOMException or Error with `name === "AbortError"`)
 *     → `timeout`.
 *  2. `TypeError` (transient fetch failure on the Workers runtime)
 *     → `network`.
 *  3. String / Error.message pattern match for known HTTP-status /
 *     provider-error wording → `rate_limited` / `quota` / `auth_failed`
 *     / `server_error`.
 *  4. Otherwise → `unknown`.
 *
 * The `message` field is always passed through {@link maskSecrets}.
 */
export function sanitizeErrorReason(input: unknown): SanitizedReasonResult {
  const rawMessage = extractMessage(input);
  const message = maskSecrets(rawMessage);
  const category = classify(input, rawMessage);
  return { category, message };
}

/**
 * Renders a {@link SanitizedReasonResult} into the `<category>: <message>`
 * string form expected by the existing UI `error?` / `reason?` fields.
 * When the masked message is empty, only the category is returned so the
 * UI never shows a trailing `": "`.
 */
export function toReasonString(sanitized: SanitizedReasonResult): string {
  return sanitized.message.length > 0
    ? `${sanitized.category}: ${sanitized.message}`
    : sanitized.category;
}

function extractMessage(input: unknown): string {
  if (input === null || input === undefined) return "";
  if (typeof input === "string") return input;
  if (input instanceof Error) {
    return typeof input.message === "string" ? input.message : "";
  }
  if (typeof input === "number" || typeof input === "boolean") {
    return String(input);
  }
  if (typeof input === "object") {
    const m = (input as { message?: unknown }).message;
    if (typeof m === "string") return m;
    try {
      return JSON.stringify(input);
    } catch {
      return "";
    }
  }
  return String(input);
}

function classify(input: unknown, rawMessage: string): SanitizedErrorReason {
  if (isAbortError(input)) return "timeout";
  if (input instanceof TypeError) return "network";

  const lower = rawMessage.toLowerCase();

  // HTTP status hints first — these are unambiguous when present.
  if (/\bhttp\s*4?29\b/.test(lower) || /\b429\b/.test(lower)) {
    return /quota|insufficient[_\s-]?quota|billing|credit/.test(lower)
      ? "quota"
      : "rate_limited";
  }
  if (/\b401\b|\b403\b/.test(lower)) {
    return /quota|billing|credit|insufficient/.test(lower)
      ? "quota"
      : "auth_failed";
  }
  if (/\bhttp\s*5\d{2}\b|\b5\d{2}\b/.test(lower)) return "server_error";

  // Wording-only hints.
  if (
    /rate[\s_-]?limit/.test(lower) ||
    /too[\s_-]?many[\s_-]?requests/.test(lower)
  ) {
    return "rate_limited";
  }
  if (/quota|insufficient[_\s-]?quota|billing|credit/.test(lower)) {
    return "quota";
  }
  if (
    /unauth(enticated|orized)?|invalid[_\s-]?api[_\s-]?key|forbidden|permission[_\s-]?denied|authentication/.test(
      lower,
    )
  ) {
    return "auth_failed";
  }
  if (/internal|server[_\s-]?error|service[_\s-]?unavailable/.test(lower)) {
    return "server_error";
  }
  if (/timed[\s_-]?out|timeout|deadline/.test(lower)) return "timeout";
  if (/network|fetch[\s_-]?failed|econnreset|enotfound/.test(lower)) {
    return "network";
  }

  return "unknown";
}

function isAbortError(error: unknown): boolean {
  if (
    typeof DOMException !== "undefined" &&
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return true;
  }
  if (error instanceof Error && error.name === "AbortError") return true;
  return false;
}
