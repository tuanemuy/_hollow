import { lookupProviderAdapter } from "@/core/adapters/llm/registry";
import { maskSecrets } from "@/core/application/llm/sanitizeErrorReason";
import type {
  LLMConnectionPingResult,
  LLMConnectionTester,
} from "@/core/domain/adminSettings/ports/llmConnectionTester";
import type { LLMConfig } from "@/core/domain/adminSettings/valueObject";

/**
 * Application-layer HTTP-based `LLMConnectionTester`. Looks the configured
 * provider up in `factoryProviderRegistry` and delegates to its unified
 * `ping` probe. Lives in the application layer rather than an adapter group
 * because it fans out across every provider.
 *
 * Result-shape unification: each provider barrel's `ProviderAdapter.ping`
 * normalizes its native probe envelope (Anthropic `{ ok, error? }`,
 * OpenAI / Gemini `{ ok, reason? }`) into `{ ok, error? }`. The dispatcher
 * folds that into the port-defined {@link LLMConnectionPingResult}
 * (`{ ok, latencyMs, error? }`) so the admin UI renders outcomes
 * uniformly. The probes never throw; transport / provider failures arrive
 * as `ok: false` carrying a human-readable detail string.
 *
 * New providers are added by exporting a `ProviderAdapter` from
 * `adapters/<provider>/index.ts` and registering it in
 * `factoryProviderRegistry`; no change here is needed.
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
    const adapter = lookupProviderAdapter(cfg.provider);
    let outcome: { ok: boolean; error?: string };
    if (adapter === undefined) {
      // `cfg.provider` is a closed literal union on the domain side, so an
      // unregistered provider is unreachable here — the guard is a
      // defensive net.
      outcome = {
        ok: false,
        error: `Unsupported LLM provider: ${String(cfg.provider)}`,
      };
    } else {
      outcome = await adapter.ping(cfg, trimmedKey, this.timeoutMs);
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
