/**
 * LLM-backed structuring port used by the ingestion pipeline.
 *
 * Surfaces two operations:
 * - `structureToHtml`: turn raw extracted text into a sanitised HTML
 *   draft, optionally suggesting a title and target directory.
 * - `suggestMetadata`: propose tag names and aliases from an already-
 *   structured HTML body.
 *
 * Error contract for adapter implementations:
 * - Transient rate limiting → `LLMRateLimitError` (retryable).
 * - Provider outage / 5xx → `LLMUnavailableError` (retryable).
 * - Request exceeded the provider's wall-clock budget →
 *   `LLMTimeoutError` (retryable).
 * - Account / project quota exhausted → `LLMQuotaExceededError`
 *   (non-retryable until quota refreshes).
 *
 * The classes live in the domain because they are part of the port
 * contract. The application layer translates them into a
 * `BusinessRuleError('llm_failure')` on the `IngestionJob` when the
 * worker has exhausted retries.
 */

export class LLMRateLimitError extends Error {
  override readonly name = "LLMRateLimitError";

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isLLMRateLimitError(
  error: unknown,
): error is LLMRateLimitError {
  return error instanceof LLMRateLimitError;
}

export class LLMUnavailableError extends Error {
  override readonly name = "LLMUnavailableError";

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isLLMUnavailableError(
  error: unknown,
): error is LLMUnavailableError {
  return error instanceof LLMUnavailableError;
}

export class LLMTimeoutError extends Error {
  override readonly name = "LLMTimeoutError";

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isLLMTimeoutError(error: unknown): error is LLMTimeoutError {
  return error instanceof LLMTimeoutError;
}

export class LLMQuotaExceededError extends Error {
  override readonly name = "LLMQuotaExceededError";

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isLLMQuotaExceededError(
  error: unknown,
): error is LLMQuotaExceededError {
  return error instanceof LLMQuotaExceededError;
}

export type LLMStructureInput = Readonly<{
  rawText: string;
  prompt: string;
  locale: string;
}>;

export type LLMStructureResult = Readonly<{
  html: string;
  titleSuggestion: string;
  directorySuggestion: string | null;
}>;

export type LLMMetadataInput = Readonly<{
  html: string;
  prompt: string;
}>;

export type LLMMetadataResult = Readonly<{
  tags: readonly string[];
  aliases: readonly string[];
}>;

export interface LLMProvider {
  /**
   * Structures `rawText` into an HTML draft suitable for downstream
   * sanitisation. The returned `html` is *unsanitised* — the ingestion
   * pipeline always pipes it through `HtmlSanitizer` before persisting.
   */
  structureToHtml(input: LLMStructureInput): Promise<LLMStructureResult>;

  /**
   * Suggests tag names and aliases for an already-structured body.
   * Returned strings are pre-validation hints; the caller is expected to
   * pipe each through `TagName.create` (and the per-owner blacklist)
   * before adopting them.
   */
  suggestMetadata(input: LLMMetadataInput): Promise<LLMMetadataResult>;
}
