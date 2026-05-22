import {
  maskSecrets,
  sanitizeErrorReason,
  toReasonString,
} from "@/core/application/llm/sanitizeErrorReason";
import type { LLMConfig } from "@/core/domain/adminSettings/valueObject";

/**
 * Anthropic-specific liveness probe used by the application-layer
 * `HttpLLMConnectionTester` dispatcher. Sends the smallest credentialed
 * request the Messages API accepts (a 1-token output budget) so the
 * admin "test connection" flow can validate auth + reachability cheaply.
 *
 * Returns `{ ok: false, error }` (never throws) on any non-2xx / transport
 * failure so the dispatcher can fold the outcome into a unified
 * `LLMConnectionPingResult`. A 4xx with provider error text
 * (`401 invalid_api_key`, `404 model_not_found`, …) is reported as-is
 * because it is still a definitive answer about credentials.
 *
 * Extracted from `llmConnectionTester.ts` in Issue #101 (ADR-003) when
 * the dispatcher was promoted into the application layer.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

type AnthropicErrorBody = Readonly<{
  error?: { type?: string; message?: string };
}>;

export async function pingAnthropic(
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
        const masked = maskSecrets(message);
        detail = type ? `${type}: ${masked}` : masked;
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
    return { ok: false, error: toReasonString(sanitizeErrorReason(error)) };
  } finally {
    clearTimeout(timer);
  }
}
