import type {
  LLMConnectionPingResult,
  LLMConnectionTester,
} from "@/core/domain/adminSettings/ports/llmConnectionTester";
import type { LLMConfig } from "@/core/domain/adminSettings/valueObject";

// ---------------------------------------------------------------------------
// Provider-specific liveness probes.
// ---------------------------------------------------------------------------
//
// The probe sends the smallest credentialed request the provider accepts
// and reports `ok: false` (with `error`) on any non-2xx / transport
// failure. It never throws — the admin "test connection" UI surfaces the
// result struct as-is.
//
// Anthropic: POST `/v1/messages` with a 1-token output budget is the
// cheapest way to validate auth + reachability. A 4xx from the provider
// (`401 invalid_api_key`, `404 model_not_found`, …) is still a
// definitive answer ("provider responded, credentials are wrong"), so
// it is reported with the provider's error text rather than collapsing
// to a generic transport error.

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 10_000;

type AnthropicErrorBody = Readonly<{
  error?: { type?: string; message?: string };
}>;

async function pingAnthropic(
  cfg: LLMConfig,
  apiKey: string,
  timeoutMs: number,
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      }),
    });
    if (response.ok) {
      return { ok: true };
    }
    let detail = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as AnthropicErrorBody;
      const message = body.error?.message;
      const type = body.error?.type;
      if (typeof message === "string" && message.length > 0) {
        detail = type ? `${type}: ${message}` : message;
      }
    } catch {
      // Fall through to HTTP-status-only detail. The probe must never
      // throw — the result struct carries `ok: false` instead.
    }
    return { ok: false, error: detail };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, error: `Request timed out after ${timeoutMs}ms` };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * HTTP-based `LLMConnectionTester`. Branches on `cfg.provider` and
 * dispatches to the matching provider probe. New providers are added by
 * extending the `switch` together with the corresponding helper.
 *
 * The probe never throws: every transport / provider failure is folded
 * into the `LLMConnectionPingResult` shape so the admin UI can render
 * the outcome uniformly.
 */
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
    return outcome.error !== undefined
      ? { ok: false, latencyMs, error: outcome.error }
      : { ok: false, latencyMs };
  }
}
