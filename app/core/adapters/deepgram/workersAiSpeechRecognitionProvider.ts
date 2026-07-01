import type { Ai } from "@cloudflare/workers-types";
import {
  SpeechFailureError,
  type SpeechRecognitionProvider,
  type SpeechTranscribeInput,
} from "@/core/domain/ingestion/ports/speechRecognitionProvider";
import { extractDeepgramTranscript, localeToLanguage } from "./transcript";

/**
 * Configuration for {@link DeepgramWorkersAiSpeechRecognitionProvider}. Unlike
 * the REST Deepgram adapter there is no `apiKey` (authentication is resolved by
 * Cloudflare via the `env.AI` binding — Issue #788 / ADR-004). The `ai` binding
 * is injected as a cross-cutting dependency, NOT smuggled through the pure
 * `SpeechAdapterConfig` (ADR-002).
 */
export type DeepgramWorkersAiSpeechConfig = Readonly<{
  /** Cloudflare Workers AI binding (`env.AI`). Undefined → transcribe fails. */
  ai?: Ai;
  /** Transcription model id — always `@cf/deepgram/nova-3` for this route. */
  model: string;
  /** Wall-clock budget per request in milliseconds. */
  timeoutMs?: number;
}>;

const DEFAULT_TIMEOUT_MS = 120_000;

/** The only Workers AI Deepgram audio model with a typed contract. */
const WORKERS_AI_DEEPGRAM_MODEL = "@cf/deepgram/nova-3";

/**
 * Cloudflare Workers AI Deepgram Nova-3 speech-to-text adapter (Issue #788).
 * Calls `env.AI.run("@cf/deepgram/nova-3", { audio: { body, contentType } })`
 * rather than issuing a REST request, so Cloudflare handles authentication and
 * no API key is required (ADR-004). The response shape
 * (`Ai_Cf_Deepgram_Nova_3_Output`) is identical to the REST body, so the
 * transcript extraction is shared with the REST adapter (ADR-006).
 *
 * Contract (per `SpeechRecognitionProvider`):
 * - Returns the transcript string; an empty / whitespace-only transcript (no
 *   detected speech), or a missing transcript field, returns `""`.
 * - Every catastrophic failure — missing `ai` binding, `run()` rejection,
 *   timeout — surfaces as `SpeechFailureError`.
 *
 * TIMEOUT (Issue #788 / ADR): the port's timeout contract is enforced with a
 * `Promise.race` against a self-managed timer that rejects with
 * `SpeechFailureError`. Note that `Promise.race` does NOT cancel the in-flight
 * `run()` — after the timer fires the underlying Workers AI request keeps
 * running server-side and may still be billed. This route intentionally does
 * NOT reuse the REST adapter's `AbortController` / `DOMException(AbortError)`
 * handling: `run()` is not driven by a fetch `AbortSignal` here, so no
 * `AbortError` is ever raised (see ADR-007 for the `AiOptions.signal` note).
 */
export class DeepgramWorkersAiSpeechRecognitionProvider
  implements SpeechRecognitionProvider
{
  private readonly ai: Ai | undefined;
  private readonly timeoutMs: number;

  // `config.model` is accepted for symmetry with the other adapters but is
  // intentionally ignored: `env.AI.run`'s typed overload requires the literal
  // model key `@cf/deepgram/nova-3` (see `WORKERS_AI_DEEPGRAM_MODEL`).
  constructor(config: DeepgramWorkersAiSpeechConfig) {
    this.ai = config.ai;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async transcribe(input: SpeechTranscribeInput): Promise<string> {
    if (this.ai === undefined) {
      throw new SpeechFailureError(
        "Cloudflare AI binding is not configured for the Workers AI speech provider",
      );
    }
    const ai = this.ai;

    const language = localeToLanguage(input.locale);

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(
          new SpeechFailureError(
            `Workers AI transcription timed out after ${this.timeoutMs}ms`,
          ),
        );
      }, this.timeoutMs);
    });

    try {
      const output = await Promise.race([
        ai.run(WORKERS_AI_DEEPGRAM_MODEL, {
          audio: { body: input.audioBytes, contentType: input.mime },
          smart_format: true,
          ...(language.length > 0 ? { language } : {}),
        }),
        timeoutPromise,
      ]);
      // Missing / whitespace-only transcript → "" (no detected speech).
      return extractDeepgramTranscript(output);
    } catch (cause) {
      // The timer already rejects with a `SpeechFailureError`; rethrow it
      // verbatim so the timeout wording survives. Any other rejection (a
      // `run()` failure) is wrapped.
      if (cause instanceof SpeechFailureError) throw cause;
      throw new SpeechFailureError("Workers AI transcription failed", cause);
    } finally {
      clearTimeout(timer);
    }
  }
}
