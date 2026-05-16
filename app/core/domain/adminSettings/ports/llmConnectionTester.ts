import type { LLMConfig } from "../valueObject";

/**
 * Liveness probe for an `LLMConfig`. Used by the admin "test connection"
 * flow — implementations send a minimal request to the upstream LLM
 * provider and report success / latency without raising on transport
 * errors (the result struct carries `ok: false` + `error` instead).
 */
export interface LLMConnectionTester {
  ping(cfg: LLMConfig, apiKey: string): Promise<LLMConnectionPingResult>;
}

export type LLMConnectionPingResult = Readonly<{
  ok: boolean;
  latencyMs: number;
  error?: string;
}>;
