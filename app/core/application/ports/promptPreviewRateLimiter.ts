/**
 * Per-user, fixed-window rate limiter guarding the prompt-preview usecase
 * (Issue #574). Each preview triggers a real, billable LLM call, so the
 * usecase consults this port before invoking the provider.
 *
 * The contract is intentionally minimal — a single atomic `tryConsume`
 * that both increments and decides — so the implementation can claim a
 * slot in one statement (no read-then-write race). This is a
 * feature-scoped limiter, not a general-purpose rate-limiting framework.
 */
export type RateLimitDecision = Readonly<{
  /** Whether this attempt is permitted (a slot was claimed). */
  allowed: boolean;
  /**
   * Seconds the caller should wait before the current window resets.
   * Meaningful only when `allowed` is `false`; `0` when allowed.
   */
  retryAfterSec: number;
}>;

export interface PromptPreviewRateLimiter {
  /**
   * Atomically attempt to consume one slot for `userId` in the window
   * containing `now`. Returns `{ allowed: true }` when the slot was
   * claimed, or `{ allowed: false, retryAfterSec }` when the window's
   * quota is already exhausted.
   */
  tryConsume(userId: string, now: Date): Promise<RateLimitDecision>;
}
