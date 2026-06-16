import { desc, inArray, lt } from "drizzle-orm";
import type { ActivityLogRepository } from "@/core/application/activityLog/ports";
import type {
  ActivityKind,
  ActivityLogEntry,
  ActivityLogRow,
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
 * per-owner sliding-window `COUNT(DISTINCT event_id)` over the threshold.
 * The windowing is performed in-process (floor-to-window bucketing) so the
 * 5-minute window — finer than the stored `hour_bucket` — is honoured
 * deterministically.
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

  async findRecent(limit: number): Promise<readonly ActivityLogRow[]> {
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

  private async readDirect(limit: number): Promise<ActivityLogRow[]> {
    const rows = await this.db
      .select({
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
      kind: row.kind as ActivityKind,
      actorId: row.actorId,
      target: row.target,
      detail: row.detail,
      severity: row.severity as ActivitySeverity,
      occurredAt: row.occurredAt,
    }));
  }

  /**
   * Derive "大量アップロード" rows from the burst table. Reads the recent burst
   * rows, groups them into `(owner, floor(occurredAt / window))` windows,
   * counts distinct events, and surfaces one row per window that reaches the
   * threshold. The read is bounded by a generous multiple of `limit` so a
   * handful of qualifying windows can still be assembled without scanning
   * the whole table.
   */
  private async readBursts(limit: number): Promise<ActivityLogRow[]> {
    // Each qualifying window consumes at least `threshold` rows, so reading
    // `limit * threshold` recent rows is enough to assemble up to `limit`
    // burst windows.
    const scan = Math.max(
      limit * LARGE_UPLOAD_THRESHOLD,
      LARGE_UPLOAD_THRESHOLD,
    );
    const rows = await this.db
      .select({
        eventId: ingestionBurstLog.eventId,
        ownerId: ingestionBurstLog.ownerId,
        occurredAt: ingestionBurstLog.occurredAt,
      })
      .from(ingestionBurstLog)
      .orderBy(desc(ingestionBurstLog.occurredAt))
      .limit(scan);

    type Window = {
      ownerId: string;
      events: Set<string>;
      latest: Date;
    };
    const windows = new Map<string, Window>();
    for (const row of rows) {
      const windowIndex = Math.floor(row.occurredAt.getTime() / WINDOW_MS);
      const key = `${row.ownerId}:${windowIndex}`;
      let window = windows.get(key);
      if (window === undefined) {
        window = {
          ownerId: row.ownerId,
          events: new Set(),
          latest: row.occurredAt,
        };
        windows.set(key, window);
      }
      window.events.add(row.eventId);
      if (row.occurredAt.getTime() > window.latest.getTime()) {
        window.latest = row.occurredAt;
      }
    }

    const qualifying = [...windows.values()].filter(
      (window) => window.events.size >= LARGE_UPLOAD_THRESHOLD,
    );
    if (qualifying.length === 0) return [];

    // Resolve owner display names so the "対象" column carries a human
    // handle rather than a raw id (AC-5).
    const ownerIds = [...new Set(qualifying.map((w) => w.ownerId))];
    const ownerRows = await this.db
      .select({ id: users.id, username: users.username, name: users.name })
      .from(users)
      .where(inArray(users.id, ownerIds));
    const handleById = new Map(
      ownerRows.map((row) => [row.id, row.username || row.name]),
    );

    return qualifying.map((window) => ({
      kind: "large_upload" as const,
      actorId: window.ownerId,
      target: handleById.get(window.ownerId) ?? window.ownerId,
      detail: `${window.events.size} 件のアップロード`,
      severity: "info" as const,
      occurredAt: window.latest,
    }));
  }
}
