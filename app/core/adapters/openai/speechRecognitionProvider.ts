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
      if (cause instanceof Error && cause.name === "AbortError") {
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
          detail = toReasonString(sanitizeErrorReason(message));
        }
      } catch {
        // Body may be plain text / empty; fall back to status-only detail.
      }
      throw new SpeechFailureError(
        `OpenAI transcription failed (HTTP ${response.status}): ${detail}`,
      );
    }

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
