import { pingAnthropic } from "@/core/adapters/anthropic/connectionPing";
import { pingGemini } from "@/core/adapters/gemini/connectionPing";
import { pingOpenAI } from "@/core/adapters/openai/connectionPing";
import { maskSecrets } from "@/core/application/llm/sanitizeErrorReason";
import type {
  LLMConnectionPingResult,
  LLMConnectionTester,
} from "@/core/domain/adminSettings/ports/llmConnectionTester";
import type { LLMConfig } from "@/core/domain/adminSettings/valueObject";

/**
 * Application-layer HTTP-based `LLMConnectionTester`. Branches on
 * `cfg.provider` and dispatches to the matching provider-specific probe
 * exported from each `adapters/<provider>/connectionPing.ts`.
 *
 * Promoted from `app/core/adapters/anthropic/llmConnectionTester.ts` to
 * the application layer in Issue #101 (ADR-003). The previous location
 * was an active layering smell once a second provider landed because the
 * dispatcher fan-outs to every provider but was housed inside a single
 * adapter group. Issue #122 ADR-005 acknowledged the smell and deferred
 * the move; this dispatcher is the resolution.
 *
 * Result-shape unification: per-provider probes return slightly different
 * envelopes — Anthropic uses `{ ok, error? }`, OpenAI / Gemini use
 * `{ ok, reason? }`. The dispatcher folds both into the port-defined
 * {@link LLMConnectionPingResult} (`{ ok, latencyMs, error? }`) so the
 * admin UI renders outcomes uniformly. The probes never throw; transport
 * / provider failures arrive as `ok: false` carrying a human-readable
 * detail string.
 *
 * New providers are added by extending the `switch` together with the
 * corresponding `pingXxx` helper.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

export class HttpLLMConnectionTester implements LLMConnectionTester {
  constructor(private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error(
        `HttpLLMConnectionTester timeoutMs must be a positive finite number; got ${timeoutMs}`,
      );
    }
  }

  async ping(cfg: LLMConfig, apiKey: string): Promise<LLMConnectionPingResult> {
    const trimmedKey = apiKey.trim();
    if (trimmedKey.length === 0) {
      return { ok: false, latencyMs: 0, error: "API key is empty" };
    }
    const start = Date.now();
    let outcome: { ok: boolean; error?: string };
    switch (cfg.provider) {
      case "anthropic":
        outcome = await pingAnthropic(cfg, trimmedKey, this.timeoutMs);
        break;
      case "openai": {
        const result = await pingOpenAI(
          cfg.baseURL !== null
            ? {
                apiKey: trimmedKey,
                model: cfg.model,
                baseURL: cfg.baseURL,
                timeoutMs: this.timeoutMs,
              }
            : {
                apiKey: trimmedKey,
                model: cfg.model,
                timeoutMs: this.timeoutMs,
              },
        );
        outcome = result.ok
          ? { ok: true }
          : { ok: false, error: result.reason };
        break;
      }
      case "gemini": {
        const result = await pingGemini({
          apiKey: trimmedKey,
          model: cfg.model,
          timeoutMs: this.timeoutMs,
        });
        outcome = result.ok
          ? { ok: true }
          : { ok: false, error: result.reason };
        break;
      }
      default: {
        // `cfg.provider` is a closed literal union on the domain side;
        // this branch is reached only if a new provider is added to
        // `LLMConfig` without a matching probe here. The TypeScript
        // `never` cast surfaces the gap at compile time.
        const exhaustive: never = cfg.provider;
        outcome = {
          ok: false,
          error: `Unsupported LLM provider: ${String(exhaustive)}`,
        };
      }
    }
    const latencyMs = Date.now() - start;
    if (outcome.ok) {
      return { ok: true, latencyMs };
    }
    // Defense-in-depth: probes already mask secrets, but rerun `maskSecrets`
    // here so a future probe that forgets to apply masking cannot leak
    // tokens through this dispatcher (ADR-002 of Issue #141). Category
    // normalization is not re-applied — see ADR-002 for why.
    return outcome.error !== undefined
      ? { ok: false, latencyMs, error: maskSecrets(outcome.error) }
      : { ok: false, latencyMs };
  }
}
