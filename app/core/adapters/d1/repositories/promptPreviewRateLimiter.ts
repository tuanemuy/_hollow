import { sql } from "drizzle-orm";
import type {
  PromptPreviewRateLimiter,
  RateLimitDecision,
} from "@/core/application/ports/promptPreviewRateLimiter";
import type { Database } from "../client";
import { promptPreviewCounters } from "../schema";
import { mapDbError } from "./helpers";

export type PromptPreviewRateLimitConfig = Readonly<{
  /** Maximum allowed previews per user per window. */
  max: number;
  /** Window length in milliseconds. */
  windowMs: number;
}>;

/**
 * D1-backed per-user fixed-window rate limiter for prompt previews
 * (Issue #574).
 *
 * Each `tryConsume` claims a slot with a single
 * `INSERT ... ON CONFLICT(user_id, window_start) DO UPDATE
 *  SET count = count + 1 WHERE count < :max RETURNING count` statement.
 * Atomicity comes from SQLite's per-statement write lock, mirroring the
 * `D1IdempotencyStore` claim approach (the SQL shape differs — DO UPDATE
 * with `setWhere` rather than DO NOTHING; see `.issue/574/adr.md` ADR-003):
 *
 * - INSERT succeeds (no existing row) → `count = 1` returned → allowed.
 * - Existing row with `count < max` → `count` incremented, returned → allowed.
 * - Existing row with `count >= max` → `setWhere` fails the UPDATE,
 *   RETURNING is empty → denied.
 * - Lost INSERT race (concurrent insert won) collapses into the existing-row
 *   path on retry; an empty RETURNING is uniformly treated as denied.
 *
 * The window bucket is `floor(now_ms / windowMs)`, so a fresh window
 * always starts at `count = 0` via a new primary key — no reset write is
 * needed. Stale buckets are swept by a pruner (out of scope here).
 */
export class D1PromptPreviewRateLimiter implements PromptPreviewRateLimiter {
  constructor(
    private readonly db: Database,
    private readonly config: PromptPreviewRateLimitConfig,
  ) {}

  async tryConsume(userId: string, now: Date): Promise<RateLimitDecision> {
    return mapDbError("Failed to consume prompt preview slot", async () => {
      const windowMs = this.config.windowMs;
      const windowStart = Math.floor(now.getTime() / windowMs);
      const rows = await this.db
        .insert(promptPreviewCounters)
        .values({ userId, windowStart, count: 1 })
        .onConflictDoUpdate({
          target: [
            promptPreviewCounters.userId,
            promptPreviewCounters.windowStart,
          ],
          set: { count: sql`${promptPreviewCounters.count} + 1` },
          setWhere: sql`${promptPreviewCounters.count} < ${this.config.max}`,
        })
        .returning({ count: promptPreviewCounters.count });

      if (rows.length > 0) {
        return { allowed: true, retryAfterSec: 0 };
      }
      // Denied: the window's quota is exhausted. Surface the time until the
      // next window boundary so the UI can hint when to retry.
      const nextWindowStartMs = (windowStart + 1) * windowMs;
      const retryAfterSec = Math.max(
        1,
        Math.ceil((nextWindowStartMs - now.getTime()) / 1000),
      );
      return { allowed: false, retryAfterSec };
    });
  }
}
