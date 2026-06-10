import { env } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDatabase } from "../client";
import { D1PromptPreviewRateLimiter } from "../repositories/promptPreviewRateLimiter";
import { promptPreviewCounters } from "../schema";

const WINDOW_MS = 3_600_000;

function makeLimiter(max: number): D1PromptPreviewRateLimiter {
  return new D1PromptPreviewRateLimiter(getDatabase(env.DB), {
    max,
    windowMs: WINDOW_MS,
  });
}

let userCounter = 0;
const nextUserId = (): string => {
  userCounter += 1;
  return `preview-user-${userCounter}`;
};

describe("D1PromptPreviewRateLimiter", () => {
  it("allows up to max consumptions within a window and denies the next", async () => {
    const limiter = makeLimiter(3);
    const userId = nextUserId();
    const now = new Date("2026-06-10T10:00:00.000Z");

    for (let i = 0; i < 3; i += 1) {
      const decision = await limiter.tryConsume(userId, now);
      expect(decision.allowed).toBe(true);
      expect(decision.retryAfterSec).toBe(0);
    }

    const denied = await limiter.tryConsume(userId, now);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBeGreaterThan(0);
  });

  it("treats the boundary count=max as denied (RETURNING empty on the over-limit UPDATE)", async () => {
    const limiter = makeLimiter(1);
    const userId = nextUserId();
    const now = new Date("2026-06-10T10:00:00.000Z");

    expect((await limiter.tryConsume(userId, now)).allowed).toBe(true);
    // count is now at max (1); the next claim's setWhere (count < 1) fails,
    // RETURNING is empty → denied.
    expect((await limiter.tryConsume(userId, now)).allowed).toBe(false);
  });

  it("resets when the window advances", async () => {
    const limiter = makeLimiter(1);
    const userId = nextUserId();
    const now = new Date("2026-06-10T10:00:00.000Z");

    expect((await limiter.tryConsume(userId, now)).allowed).toBe(true);
    expect((await limiter.tryConsume(userId, now)).allowed).toBe(false);

    // Advance into the next fixed window — a new (user_id, window_start)
    // bucket starts fresh at count=0.
    const nextWindow = new Date(now.getTime() + WINDOW_MS);
    expect((await limiter.tryConsume(userId, nextWindow)).allowed).toBe(true);
  });

  it("scopes counters per user", async () => {
    const limiter = makeLimiter(1);
    const a = nextUserId();
    const b = nextUserId();
    const now = new Date("2026-06-10T10:00:00.000Z");

    expect((await limiter.tryConsume(a, now)).allowed).toBe(true);
    expect((await limiter.tryConsume(a, now)).allowed).toBe(false);
    // A different user has an independent bucket.
    expect((await limiter.tryConsume(b, now)).allowed).toBe(true);
  });

  it("opportunistically prunes the user's stale window rows, keeping ~one row per user", async () => {
    const limiter = makeLimiter(5);
    const userId = nextUserId();
    const db = getDatabase(env.DB);
    const now = new Date("2026-06-10T10:00:00.000Z");

    await limiter.tryConsume(userId, now);
    await limiter.tryConsume(userId, new Date(now.getTime() + WINDOW_MS));
    // A third, later window: the two older buckets must have been deleted.
    await limiter.tryConsume(userId, new Date(now.getTime() + 2 * WINDOW_MS));

    const rows = await db
      .select({ windowStart: promptPreviewCounters.windowStart })
      .from(promptPreviewCounters)
      .where(eq(promptPreviewCounters.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.windowStart).toBe(
      Math.floor((now.getTime() + 2 * WINDOW_MS) / WINDOW_MS),
    );
  });

  it("only prunes the acting user's stale rows, not other users'", async () => {
    const limiter = makeLimiter(5);
    const a = nextUserId();
    const b = nextUserId();
    const db = getDatabase(env.DB);
    const now = new Date("2026-06-10T10:00:00.000Z");

    await limiter.tryConsume(b, now);
    // `a` advancing windows must not delete `b`'s row in the older window.
    await limiter.tryConsume(a, now);
    await limiter.tryConsume(a, new Date(now.getTime() + WINDOW_MS));

    const bRows = await db
      .select({ windowStart: promptPreviewCounters.windowStart })
      .from(promptPreviewCounters)
      .where(
        and(
          eq(promptPreviewCounters.userId, b),
          eq(
            promptPreviewCounters.windowStart,
            Math.floor(now.getTime() / WINDOW_MS),
          ),
        ),
      );
    expect(bRows).toHaveLength(1);
  });

  it("admits exactly max winners under concurrent claims on the same window", async () => {
    const limiter = makeLimiter(5);
    const userId = nextUserId();
    const now = new Date("2026-06-10T10:00:00.000Z");

    const results = await Promise.all(
      Array.from({ length: 12 }, () => limiter.tryConsume(userId, now)),
    );
    const allowed = results.filter((r) => r.allowed);
    expect(allowed).toHaveLength(5);
  });
});
