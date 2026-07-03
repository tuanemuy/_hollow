import {
  sanitizeErrorReason,
  toReasonString,
} from "@/core/application/llm/sanitizeErrorReason";
import {
  SpeechFailureError,
  type SpeechRecognitionProvider,
  type SpeechTranscribeInput,
} from "@/core/domain/ingestion/ports/speechRecognitionProvider";
import { extractDeepgramTranscript, localeToLanguage } from "./transcript";

/**
 * Configuration for {@link DeepgramSpeechRecognitionProvider}. Symmetric with
 * {@link OpenAISpeechConfig} but with no `baseURL` axis — Deepgram's
 * prerecorded endpoint is fixed (`https://api.deepgram.com/v1/listen`).
 */
export type DeepgramSpeechConfig = Readonly<{
  /** Deepgram API key. Sourced from env or DB ciphertext. */
  apiKey: string;
  /** Transcription model id (e.g. `nova-3`). */
  model: string;
  /** Wall-clock budget per request in milliseconds. */
  timeoutMs?: number;
}>;

const DEFAULT_TIMEOUT_MS = 120_000;
/** Deepgram's prerecorded listen endpoint (fixed; no `baseURL` axis). */
const LISTEN_ENDPOINT = "https://api.deepgram.com/v1/listen";

type DeepgramErrorBody = Readonly<{
  err_code?: unknown;
  err_msg?: unknown;
  // Some Deepgram error shapes use `message` / `reason` instead.
  message?: unknown;
  reason?: unknown;
}>;

type DeepgramTranscriptionResponse = Readonly<{
  results?: Readonly<{
    channels?: ReadonlyArray<
      Readonly<{
        alternatives?: ReadonlyArray<Readonly<{ transcript?: unknown }>>;
      }>
    >;
  }>;
}>;

/**
 * True when `error` is an `AbortError` from the timeout `AbortController`.
 * Checks `DOMException` and `Error` separately: on Cloudflare Workers
 * (workerd) `fetch` aborts reject with a `DOMException` that does NOT
 * extend `Error`, so an `instanceof Error`-only guard misclassifies the
 * timeout. Symmetric with the OpenAI speech adapter's `isAbortError`.
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
 * Builds the listen URL with `model`, `language`, and `smart_format`. An
 * empty `language` is omitted entirely (rather than sent blank).
 */
function buildListenURL(model: string, language: string): string {
  const u = new URL(LISTEN_ENDPOINT);
  u.searchParams.set("model", model);
  if (language.length > 0) {
    u.searchParams.set("language", language);
  }
  u.searchParams.set("smart_format", "true");
  return u.toString();
}

/**
 * Deepgram prerecorded `/v1/listen` adapter. Sends the raw audio bytes as the
 * request body (`Content-Type: <mime>`) rather than multipart/form-data —
 * Deepgram's prerecorded API accepts the audio bytes directly. This is the
 * key structural difference from the OpenAI adapter (which builds `FormData`).
 *
 * Contract (per `SpeechRecognitionProvider`):
 * - Returns the transcript string; an empty / whitespace-only transcript
 *   (no detected speech), or a missing transcript field, returns `""`.
 * - Every catastrophic failure — empty key, non-2xx, timeout, transport,
 *   malformed body — surfaces as `SpeechFailureError`.
 *
 * Cloudflare Workers' `fetch` accepts an `ArrayBuffer` as a `BodyInit`, so the
 * raw body is sent without a `Blob`/`FormData` wrapper.
 */
export class DeepgramSpeechRecognitionProvider
  implements SpeechRecognitionProvider
{
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(config: DeepgramSpeechConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async transcribe(input: SpeechTranscribeInput): Promise<string> {
    if (this.apiKey.trim().length === 0) {
      throw new SpeechFailureError("Deepgram api key is empty");
    }

    // No pre-flight size guard (unlike the OpenAI adapter's 25 MiB check):
    // Deepgram's prerecorded limit is far looser, so oversized payloads are
    // left to the request timeout rather than a hard cap (ADR-001 / plan.md).

    const language = localeToLanguage(input.locale);
    const endpoint = buildListenURL(this.model, language);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: {
          authorization: `Token ${this.apiKey}`,
          "content-type": input.mime,
        },
        body: input.audioBytes,
      });
    } catch (cause) {
      // Cloudflare Workers (workerd) rejects the aborted fetch with a
      // `DOMException` whose `name === "AbortError"`, and workerd's
      // `DOMException` does NOT extend `Error`. An `instanceof Error`-only
      // guard would let the Workers timeout fall through to the generic
      // transport branch below.
      if (isAbortError(cause)) {
        throw new SpeechFailureError(
          `Deepgram transcription timed out after ${this.timeoutMs}ms`,
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
        const body = (await response.json()) as DeepgramErrorBody;
        const message =
          typeof body.err_msg === "string"
            ? body.err_msg
            : typeof body.message === "string"
              ? body.message
              : typeof body.reason === "string"
                ? body.reason
                : undefined;
        if (typeof message === "string" && message.length > 0) {
          // Non-2xx detail is run through the full `sanitizeErrorReason`
          // (category + masking), symmetric with the OpenAI adapter and
          // mirroring the sanitize-vs-mask asymmetry against the ping probe.
          detail = toReasonString(sanitizeErrorReason(message));
        }
      } catch {
        // Body may be plain text / empty; fall back to status-only detail.
      }
      throw new SpeechFailureError(
        `Deepgram transcription failed (HTTP ${response.status}): ${detail}`,
      );
    }

    // Success path: the 2xx JSON body is NOT run through secret masking
    // because the transcript is the user's content (not secret-bearing) and
    // the rest of the body is discarded. Safe only while callers never
    // surface `SpeechFailureError.message` / `.cause` to the UI or logs (see
    // the OpenAI adapter's matching note). `runIngestionJob` swallows
    // `SpeechFailureError` (collapses to `""`) without logging it.
    let body: DeepgramTranscriptionResponse;
    try {
      body = (await response.json()) as DeepgramTranscriptionResponse;
    } catch (cause) {
      throw new SpeechFailureError(
        "Deepgram transcription response was not valid JSON",
        cause,
      );
    }
    // Missing / whitespace-only transcript → "" (no detected speech).
    return extractDeepgramTranscript(body);
  }
}
