/**
 * Best-effort kick of the outbox relay so newly-persisted events
 * publish without waiting for the safety-net cron.
 *
 * Contract:
 *   - Fire-and-forget: `kick()` returns `void` and callers MUST NOT
 *     await its completion. Both synchronous (e.g. queue a fetch) and
 *     asynchronous (e.g. in-isolate `processOutboxEvents` run scheduled
 *     via `waitUntil`) implementations are valid — neither one extends
 *     the calling usecase's critical path.
 *   - Implementations MUST NOT throw. Any internal failure must be
 *     logged and swallowed; a failed kick is a latency degradation
 *     (the cron picks the rows up on the next tick), not a correctness
 *     problem.
 *   - Idempotent: a kick that loses the race with a concurrent run on
 *     the relay worker is a no-op — the relay claims rows under a lease.
 *   - Detached lifetime: implementations should arrange for the kick to
 *     outlive the request (e.g. via `ExecutionContext.waitUntil`) so the
 *     outgoing request is not cancelled when the response is sent.
 */
export interface RelayTrigger {
  kick(): void;
}

export const NoopRelayTrigger: RelayTrigger = {
  kick: () => {},
};
