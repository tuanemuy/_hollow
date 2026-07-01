import type { Ai } from "@cloudflare/workers-types";
import { lookupSpeechAdapter } from "@/core/adapters/speech/registry";
import { maskSecrets } from "@/core/application/llm/sanitizeErrorReason";
import type {
  SpeechConnectionPingResult,
  SpeechConnectionTester,
} from "@/core/domain/adminSettings/ports/speechConnectionTester";
import { SpeechRecognitionConfig } from "@/core/domain/adminSettings/valueObject";

/**
 * Application-layer HTTP-based `SpeechConnectionTester`. Looks the
 * configured provider up in `speechProviderRegistry` and delegates to its
 * `ping` probe. Lives in the application layer rather than an adapter group
 * because it fans out across every speech provider. Symmetric with
 * {@link HttpLLMConnectionTester}.
 *
 * The probes never throw; transport / provider failures arrive as
 * `ok: false` carrying a human-readable detail string, folded into the
 * port-defined {@link SpeechConnectionPingResult}.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

export class HttpSpeechConnectionTester implements SpeechConnectionTester {
  constructor(
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
    // Cloudflare Workers AI binding (Issue #788 / ADR-005). Threaded to the
    // keyless `deepgram-workers-ai` adapter's `ping` (which confirms binding
    // presence). REST adapters ignore it.
    private readonly ai?: Ai,
  ) {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new Error(
        `HttpSpeechConnectionTester timeoutMs must be a positive finite number; got ${timeoutMs}`,
      );
    }
  }

  async ping(
    cfg: SpeechRecognitionConfig,
    apiKey: string,
  ): Promise<SpeechConnectionPingResult> {
    const trimmedKey = apiKey.trim();
    // Keyless providers (Issue #788) have no api key — skip the empty-key
    // short-circuit so the binding-presence probe (ADR-005) still runs. REST
    // providers keep the strict empty-key guard.
    const keyless = !SpeechRecognitionConfig.requiresApiKey(cfg.provider);
    if (!keyless && trimmedKey.length === 0) {
      return { ok: false, latencyMs: 0, error: "API key is empty" };
    }
    const start = Date.now();
    const adapter = lookupSpeechAdapter(cfg.provider);
    let outcome: { ok: boolean; error?: string };
    if (adapter === undefined) {
      // `cfg.provider` is a closed literal union on the domain side, so an
      // unregistered provider is unreachable here — the guard is a
      // defensive net.
      outcome = {
        ok: false,
        error: `Unsupported speech provider: ${String(cfg.provider)}`,
      };
    } else {
      outcome = await adapter.ping(
        cfg,
        trimmedKey,
        this.timeoutMs,
        this.ai !== undefined ? { ai: this.ai } : undefined,
      );
    }
    const latencyMs = Date.now() - start;
    if (outcome.ok) {
      return { ok: true, latencyMs };
    }
    // Defense-in-depth: rerun `maskSecrets` so a probe that forgets masking
    // cannot leak tokens through this dispatcher (mirrors
    // `HttpLLMConnectionTester`).
    return outcome.error !== undefined
      ? { ok: false, latencyMs, error: maskSecrets(outcome.error) }
      : { ok: false, latencyMs };
  }
}
