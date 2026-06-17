import { asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import type {
  ActivityLogRepository,
  RecentActivityRow,
} from "@/core/application/activityLog/ports";
import type {
  ActivityKind,
  ActivityLogEntry,
  ActivitySeverity,
  IngestionBurstEntry,
} from "@/core/application/activityLog/types";
import {
  LARGE_UPLOAD_THRESHOLD,
  LARGE_UPLOAD_WINDOW_MINUTES,
} from "@/core/application/activityLog/types";
import type { Database } from "../client";
import { activityLog, ingestionBurstLog, users } from "../schema";
import { mapDbError } from "./helpers";

const WINDOW_MS = LARGE_UPLOAD_WINDOW_MINUTES * 60_000;

/**
 * D1 implementation of {@link ActivityLogRepository}.
 *
 * Writes execute immediately against the binding — the activity log is a
 * derived read-model, not part of any aggregate UoW (ADR-006). Idempotency
 * is enforced by `ON CONFLICT(event_id) DO NOTHING` on both the direct
 * projection (`activity_log`) and the burst intermediate table
 * (`ingestion_burst_log`), so at-least-once redelivery never duplicates a
 * row or inflates a burst count (ADR-001 / ADR-005).
 *
 * `findRecent` merges two sources: directly-projected `activity_log` rows
 * and "大量アップロード" rows derived at read time from the burst table by a
 * per-owner *sliding*-window `COUNT(DISTINCT event_id)` over the threshold.
 * The aggregation is scoped per owner (candidate owners are selected with a
 * `HAVING COUNT(*) >= threshold` pre-filter, then each owner's events are
 * read through the `(owner_id, occurred_at)` index) so a single global
 * occurred_at scan can no longer starve a qualifying owner. The window is a
 * true sliding window — any `LARGE_UPLOAD_WINDOW_MINUTES`-wide span reaching
 * the threshold qualifies, so a burst straddling a fixed bucket boundary is
 * still detected.
 */
export class D1ActivityLogRepository implements ActivityLogRepository {
  constructor(private readonly db: Database) {}

  async insertIfAbsent(entry: ActivityLogEntry): Promise<void> {
    await mapDbError("Failed to insert activity log entry", async () => {
      await this.db
        .insert(activityLog)
        .values({
          id: entry.id,
          eventId: entry.eventId,
          kind: entry.kind,
          actorId: entry.actorId,
          target: entry.target,
          detail: entry.detail,
          severity: entry.severity,
          occurredAt: entry.occurredAt,
          createdAt: entry.createdAt,
        })
        .onConflictDoNothing({ target: activityLog.eventId });
    });
  }

  async recordBurst(entry: IngestionBurstEntry): Promise<void> {
    await mapDbError("Failed to record ingestion burst entry", async () => {
      await this.db
        .insert(ingestionBurstLog)
        .values({
          id: entry.id,
          eventId: entry.eventId,
          ownerId: entry.ownerId,
          hourBucket: entry.hourBucket,
          occurredAt: entry.occurredAt,
        })
        .onConflictDoNothing({ target: ingestionBurstLog.eventId });
    });
  }

  async findRecent(limit: number): Promise<readonly RecentActivityRow[]> {
    if (!Number.isInteger(limit) || limit <= 0) return [];
    return mapDbError("Failed to read recent activity", async () => {
      const direct = await this.readDirect(limit);
      const bursts = await this.readBursts(limit);
      // Merge both sources and keep the most-recent `limit` rows.
      return [...direct, ...bursts]
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .slice(0, limit);
    });
  }

  async pruneOlderThan(cutoff: Date): Promise<{ deleted: number }> {
    return mapDbError("Failed to prune activity log", async () => {
      const rows = await this.db
        .delete(activityLog)
        .where(lt(activityLog.occurredAt, cutoff))
        .returning({ id: activityLog.id });
      return { deleted: rows.length };
    });
  }

  async pruneBurstOlderThan(cutoff: Date): Promise<{ deleted: number }> {
    return mapDbError("Failed to prune ingestion burst log", async () => {
      const rows = await this.db
        .delete(ingestionBurstLog)
        .where(lt(ingestionBurstLog.occurredAt, cutoff))
        .returning({ id: ingestionBurstLog.id });
      return { deleted: rows.length };
    });
  }

  private async readDirect(limit: number): Promise<RecentActivityRow[]> {
    const rows = await this.db
      .select({
        id: activityLog.id,
        kind: activityLog.kind,
        actorId: activityLog.actorId,
        target: activityLog.target,
        detail: activityLog.detail,
        severity: activityLog.severity,
        occurredAt: activityLog.occurredAt,
      })
      .from(activityLog)
      .orderBy(desc(activityLog.occurredAt))
      .limit(limit);
    return rows.map((row) => ({
      // Stable list key for directly-projected rows = the row's own id.
      key: row.id,
      kind: row.kind as ActivityKind,
      actorId: row.actorId,
      target: row.target,
      detail: row.detail,
      severity: row.severity as ActivitySeverity,
      occurredAt: row.occurredAt,
    }));
  }

  /**
   * Derive "大量アップロード" rows from the burst table with a per-owner
   * sliding-window aggregation.
   *
   * The previous global `occurred_at desc` scan (bounded by
   * `limit * threshold`) could starve a qualifying owner: when many owners
   * each contribute a few sub-threshold rows, the newest rows fill the scan
   * budget before a deeper owner's qualifying window is reached, and the
   * burst row goes missing. The aggregation is also a true sliding
   * window rather than a fixed floor bucket, so a burst straddling a bucket
   * boundary (e.g. 12:04–12:06 with a 5-minute window) is still detected.
   *
   * Strategy: a `GROUP BY owner_id HAVING COUNT(*) >= threshold` pre-filter
   * narrows the table to owners that *could* hold a qualifying window
   * (having `threshold` rows is a necessary precondition); each candidate
   * owner's events are then read in `occurred_at` order through the
   * `(owner_id, occurred_at)` index and scanned with a two-pointer sliding
   * window. `ingestion_burst_log` is pruned to 24h retention (ADR-007), so
   * the per-owner read is bounded by that window.
   */
  private async readBursts(limit: number): Promise<RecentActivityRow[]> {
    // Candidate owners: only those with at least `threshold` rows total can
    // possibly have a qualifying window. Ordered most-recent-first so the
    // `limit` slice keeps the freshest bursts when many owners qualify.
    const candidates = await this.db
      .select({
        ownerId: ingestionBurstLog.ownerId,
        latest: sql<number>`max(${ingestionBurstLog.occurredAt})`,
      })
      .from(ingestionBurstLog)
      .groupBy(ingestionBurstLog.ownerId)
      .having(sql`count(*) >= ${LARGE_UPLOAD_THRESHOLD}`)
      .orderBy(desc(sql`max(${ingestionBurstLog.occurredAt})`))
      .limit(limit);
    if (candidates.length === 0) return [];

    const bursts: Array<{
      ownerId: string;
      count: number;
      windowStart: Date;
      windowEnd: Date;
    }> = [];
    for (const candidate of candidates) {
      const burst = await this.findOwnerBurst(candidate.ownerId);
      if (burst !== null) bursts.push(burst);
    }
    if (bursts.length === 0) return [];

    // Resolve owner display names so the "対象" column carries a human
    // handle rather than a raw id.
    const ownerIds = [...new Set(bursts.map((b) => b.ownerId))];
    const ownerRows = await this.db
      .select({ id: users.id, username: users.username, name: users.name })
      .from(users)
      .where(inArray(users.id, ownerIds));
    const handleById = new Map(
      ownerRows.map((row) => [row.id, row.username || row.name]),
    );

    return bursts.map((burst) => ({
      // Deterministic list key: owner + the qualifying window's start. The
      // same data always yields the same key, so React list identity is
      // stable across re-renders.
      key: `large_upload:${burst.ownerId}:${burst.windowStart.toISOString()}`,
      kind: "large_upload" as const,
      actorId: burst.ownerId,
      target: handleById.get(burst.ownerId) ?? burst.ownerId,
      detail: `${burst.count} 件のアップロード`,
      severity: "info" as const,
      occurredAt: burst.windowEnd,
    }));
  }

  /**
   * Read one owner's burst events occurred_at-ascending and find the
   * densest qualifying sliding window. Returns the window with the latest
   * end (so the surfaced row sorts as the owner's most recent burst), or
   * `null` if no `LARGE_UPLOAD_WINDOW_MINUTES`-wide span reaches the
   * threshold. `event_id` is unique per row, so distinct-event counting
   * reduces to counting rows.
   */
  private async findOwnerBurst(ownerId: string): Promise<{
    ownerId: string;
    count: number;
    windowStart: Date;
    windowEnd: Date;
  } | null> {
    const rows = await this.db
      .select({ occurredAt: ingestionBurstLog.occurredAt })
      .from(ingestionBurstLog)
      .where(eq(ingestionBurstLog.ownerId, ownerId))
      .orderBy(asc(ingestionBurstLog.occurredAt));
    const times = rows.map((row) => row.occurredAt.getTime());

    let best: { count: number; start: number; end: number } | null = null;
    let left = 0;
    for (let right = 0; right < times.length; right += 1) {
      // Shrink from the left until every event in [left, right] lies within
      // one `WINDOW_MS`-wide window.
      while (times[right] - times[left] >= WINDOW_MS) left += 1;
      const count = right - left + 1;
      if (
        count >= LARGE_UPLOAD_THRESHOLD &&
        // Prefer the window that ends latest, then the larger count.
        (best === null ||
          times[right] > best.end ||
          (times[right] === best.end && count > best.count))
      ) {
        best = { count, start: times[left], end: times[right] };
      }
    }

    if (best === null) return null;
    return {
      ownerId,
      count: best.count,
      windowStart: new Date(best.start),
      windowEnd: new Date(best.end),
    };
  }
}
