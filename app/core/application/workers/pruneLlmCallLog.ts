import type { WorkerContainer } from "../di/types";
import { LLM_CALL_LOG_RETENTION_HOURS } from "../llmCallLog/types";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Prune the `llm_call_log` read-model (#748 ADR-005).
 *
 * The table accumulates one row per *actual* LLM API call and is NOT swept
 * by the outbox pruner. It is high frequency, so it is kept to a short
 * `LLM_CALL_LOG_RETENTION_HOURS` (48h) window — strictly larger than the
 * dashboard's 24h display window, so the daily tick can never remove a row
 * the dashboard still shows, whatever time the tick lands.
 *
 * Runs on the pruner worker's daily tick in its own try/catch block,
 * isolated from the activity-log prune so neither prune blocks the other
 * (#748 ADR-005 / arch[S-003]).
 */
export async function pruneLlmCallLog(
  container: WorkerContainer,
): Promise<{ deleted: number }> {
  const { clock, logger, llmCallLogRecorder } = container;
  const cutoff = new Date(
    clock.now().getTime() - LLM_CALL_LOG_RETENTION_HOURS * HOUR_MS,
  );
  const { deleted } = await llmCallLogRecorder.pruneOlderThan(cutoff);
  logger.info(`[llm-call-log] pruned ${deleted} row(s)`, {
    deleted,
    cutoff: cutoff.toISOString(),
  });
  return { deleted };
}
