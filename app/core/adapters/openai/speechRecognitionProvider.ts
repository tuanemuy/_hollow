import {
  sanitizeErrorReason,
  toReasonString,
} from "@/core/application/llm/sanitizeErrorReason";
import {
  SpeechFailureError,
  type SpeechRecognitionProvider,
  type SpeechTranscribeInput,
} from "@/core/domain/ingestion/ports/speechRecognitionProvider";
import { DEFAULT_BASE_URL } from "./messagesClient";

/**
 * Configuration for {@link OpenAISpeechRecognitionProvider}. Mirrors the
 * shape of {@link OpenAISharedConfig} but is kept separate because the
 * transcription endpoint is multipart/form-data rather than JSON — none of
 * the Chat-Completions request plumbing in `messagesClient.ts` is reusable
 * (only the base-URL default is shared).
 */
export type OpenAISpeechConfig = Readonly<{
  /** OpenAI-compatible API key. Sourced from env or DB ciphertext. */
  apiKey: string;
  /** Transcription model id (e.g. `gpt-4o-transcribe`). */
  model: string;
  /**
   * Base URL for the OpenAI-compatible endpoint. The adapter appends
   * `/audio/transcriptions`. Defaults to `https://api.openai.com/v1`.
   */
  baseURL?: string;
  /** Wall-clock budget per request in milliseconds. */
  timeoutMs?: number;
}>;

const DEFAULT_TIMEOUT_MS = 120_000;
/** OpenAI's hard upper bound for the transcription endpoint (25 MiB). */
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

type OpenAIErrorBody = Readonly<{
  error?: Readonly<{ type?: string; message?: string; code?: string }>;
}>;

type OpenAITranscriptionResponse = Readonly<{ text?: unknown }>;

/**
 * True when `error` is an `AbortError` from the timeout `AbortController`.
 * Checks `DOMException` and `Error` separately: on Cloudflare Workers
 * (workerd) `fetch` aborts reject with a `DOMException` that does NOT
 * extend `Error`, so an `instanceof Error`-only guard misclassifies the
 * timeout. Symmetric with `messagesClient.ts` `isAbortError`.
 */
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

/**
 * Builds the transcription URL by appending `/audio/transcriptions` to the
 * base URL while preserving any query string. Symmetric with
 * `buildChatCompletionsURL` in `messagesClient.ts`.
 */
function buildTranscriptionsURL(baseURL: string | undefined): string {
  const u = new URL(baseURL ?? DEFAULT_BASE_URL);
  u.pathname = `${u.pathname.replace(/\/$/, "")}/audio/transcriptions`;
  return u.toString();
}

/**
 * Maps the port `locale` (e.g. `ja` / `ja-JP`) onto the ISO-639-1 language
 * hint OpenAI's transcription endpoint accepts. Best-effort: takes the first
 * subtag and lower-cases it. An empty locale yields no hint.
 */
function localeToLanguage(locale: string): string {
  const primary = locale.split(/[-_]/)[0]?.trim().toLowerCase() ?? "";
  return primary;
}

/**
 * OpenAI `/audio/transcriptions` adapter (Issue #701 ADR-001). Sends the
 * raw audio bytes as multipart/form-data (`file` + `model` + `language`).
 *
 * Contract (per `SpeechRecognitionProvider`):
 * - Returns the transcript string; an empty / whitespace-only transcript
 *   (no detected speech) returns `""`.
 * - Every catastrophic failure — oversize input, non-2xx, timeout,
 *   transport, malformed body — surfaces as `SpeechFailureError`.
 *
 * The `Content-Type: multipart/form-data; boundary=...` header is left for
 * `fetch` to set from the `FormData` body; setting it by hand would omit the
 * boundary. Cloudflare Workers' `fetch` supports `FormData` bodies.
 */
export class OpenAISpeechRecognitionProvider
  implements SpeechRecognitionProvider
{
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseURL: string | undefined;
  private readonly timeoutMs: number;

  constructor(config: OpenAISpeechConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseURL = config.baseURL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async transcribe(input: SpeechTranscribeInput): Promise<string> {
    if (this.apiKey.trim().length === 0) {
      throw new SpeechFailureError("OpenAI api key is empty");
    }
    if (input.audioBytes.byteLength > MAX_AUDIO_BYTES) {
      throw new SpeechFailureError(
        `Audio exceeds OpenAI transcription limit (${input.audioBytes.byteLength} > ${MAX_AUDIO_BYTES} bytes)`,
      );
    }

    const endpoint = buildTranscriptionsURL(this.baseURL);
    const language = localeToLanguage(input.locale);

    const form = new FormData();
    form.append(
      "file",
      new Blob([input.audioBytes], { type: input.mime }),
      filenameForMime(input.mime),
    );
    form.append("model", this.model);
    if (language.length > 0) {
      form.append("language", language);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
        },
        body: form,
      });
    } catch (cause) {
      // Cloudflare Workers (workerd) rejects the aborted fetch with a
      // `DOMException` whose `name === "AbortError"`, and workerd's
      // `DOMException` does NOT extend `Error`. An `instanceof Error`-only
      // guard would let the Workers timeout fall through to the generic
      // transport branch below. Mirror `messagesClient.ts` `isAbortError`.
      if (isAbortError(cause)) {
        throw new SpeechFailureError(
          `OpenAI transcription timed out after ${this.timeoutMs}ms`,
          cause,
        );
      }
      throw new SpeechFailureError(
        toReasonString(sanitizeErrorReason(cause)),
        cause,
      );
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = (await response.json()) as OpenAIErrorBody;
        const message = body.error?.message;
        if (typeof message === "string" && message.length > 0) {
          // Non-2xx detail is run through the full `sanitizeErrorReason`
          // (category + masking), unlike `speechConnectionPing.ts` which
          // uses `maskSecrets` only. This asymmetry is intentional and
          // mirrors `messagesClient.ts` (sanitize) vs `connectionPing.ts`
          // (mask-only): the transcribe failure surfaces as a categorized
          // `SpeechFailureError`, the ping is a probe that already labels
          // its own category. Both mask secrets, so no key leaks either way.
          detail = toReasonString(sanitizeErrorReason(message));
        }
      } catch {
        // Body may be plain text / empty; fall back to status-only detail.
      }
      throw new SpeechFailureError(
        `OpenAI transcription failed (HTTP ${response.status}): ${detail}`,
      );
    }

    // Success path: the 2xx JSON body is NOT run through secret masking
    // because `body.text` is the user's transcript (not secret-bearing) and
    // the rest of the body is discarded. This is safe ONLY while callers
    // never surface `SpeechFailureError.message` / `.cause` to the UI or
    // logs: the `cause` retained on the catch branches above holds the raw
    // `fetch` exception (which can carry the request URL) and OpenAI's error
    // object. `runIngestionJob` swallows `SpeechFailureError` (collapses to
    // `""`) and never logs its `message`/`cause`. A future change that logs
    // or displays them must re-introduce masking — see security review W-003.
    let body: OpenAITranscriptionResponse;
    try {
      body = (await response.json()) as OpenAITranscriptionResponse;
    } catch (cause) {
      throw new SpeechFailureError(
        "OpenAI transcription response was not valid JSON",
        cause,
      );
    }
    if (typeof body.text !== "string") {
      // No usable transcript field — treat as no detected speech.
      return "";
    }
    return body.text.trim();
  }
}

/**
 * Derives a plausible upload filename from the MIME type. OpenAI keys its
 * format detection off the `file` field's extension, so a missing / unknown
 * extension would be rejected — fall back to a generic name with a
 * best-effort extension from the MIME subtype.
 */
function filenameForMime(mime: string): string {
  const subtype = mime.split("/")[1]?.split(";")[0]?.trim() ?? "";
  const ext = subtype.length > 0 ? subtype.replace(/^x-/, "") : "bin";
  return `audio.${ext}`;
}
