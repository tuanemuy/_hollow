import type { ActivityLogRepository } from "@/core/application/activityLog/ports";
import type {
  ActivityLogEntry,
  ActivityLogRow,
  IngestionBurstEntry,
} from "@/core/application/activityLog/types";

/**
 * In-memory {@link ActivityLogRepository} fake for unit tests. `insertIfAbsent`
 * and `recordBurst` are idempotent on `eventId`, mirroring the D1 adapter's
 * `ON CONFLICT(event_id) DO NOTHING` so projection-idempotency tests behave
 * identically to the real store.
 */
export class FakeActivityLogRepository implements ActivityLogRepository {
  readonly entries: ActivityLogEntry[] = [];
  readonly bursts: IngestionBurstEntry[] = [];

  async insertIfAbsent(entry: ActivityLogEntry): Promise<void> {
    if (this.entries.some((e) => e.eventId === entry.eventId)) return;
    this.entries.push(entry);
  }

  async recordBurst(entry: IngestionBurstEntry): Promise<void> {
    if (this.bursts.some((e) => e.eventId === entry.eventId)) return;
    this.bursts.push(entry);
  }

  async findRecent(limit: number): Promise<readonly ActivityLogRow[]> {
    return [...this.entries]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
      .slice(0, limit)
      .map((e) => ({
        kind: e.kind,
        actorId: e.actorId,
        target: e.target,
        detail: e.detail,
        severity: e.severity,
        occurredAt: e.occurredAt,
      }));
  }

  async pruneOlderThan(cutoff: Date): Promise<{ deleted: number }> {
    const before = this.entries.length;
    for (let i = this.entries.length - 1; i >= 0; i -= 1) {
      const entry = this.entries[i];
      if (
        entry !== undefined &&
        entry.occurredAt.getTime() < cutoff.getTime()
      ) {
        this.entries.splice(i, 1);
      }
    }
    return { deleted: before - this.entries.length };
  }

  async pruneBurstOlderThan(cutoff: Date): Promise<{ deleted: number }> {
    const before = this.bursts.length;
    for (let i = this.bursts.length - 1; i >= 0; i -= 1) {
      const entry = this.bursts[i];
      if (
        entry !== undefined &&
        entry.occurredAt.getTime() < cutoff.getTime()
      ) {
        this.bursts.splice(i, 1);
      }
    }
    return { deleted: before - this.bursts.length };
  }
}
