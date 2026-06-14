import type { SpeechRecognitionConfig } from "../valueObject";

/**
 * Liveness probe for a `SpeechRecognitionConfig`. Used by the admin "test
 * connection" flow on `/admin/speech` — implementations send a minimal
 * request to the upstream speech provider (a lightweight model-existence /
 * auth probe, NOT a real transcription; Issue #701 ADR-006) and report
 * success / latency without raising on transport errors (the result struct
 * carries `ok: false` + `error` instead). Symmetric with
 * {@link LLMConnectionTester}.
 */
export interface SpeechConnectionTester {
  ping(
    cfg: SpeechRecognitionConfig,
    apiKey: string,
  ): Promise<SpeechConnectionPingResult>;
}

export type SpeechConnectionPingResult = Readonly<{
  ok: boolean;
  latencyMs: number;
  error?: string;
}>;
