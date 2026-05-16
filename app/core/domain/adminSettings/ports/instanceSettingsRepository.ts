import type { ExpectedVersion } from "@/core/domain/common/transactionalRepository";
import type { InstanceSettings } from "../entity";

/**
 * Repository for the singleton `InstanceSettings` aggregate.
 *
 * Unlike per-row aggregates, `InstanceSettings` has exactly one logical
 * instance per deployment, so the port intentionally does not extend
 * `TransactionalRepository`:
 *
 * - `get()` never returns `null` — when the row is missing, the adapter
 *   materializes `InstanceSettings.default(now)` and returns it. Callers
 *   don't have to special-case "first time".
 * - `save()` is the only write path (no `insert` / `delete`). The OCC
 *   token captured at read time is threaded through to enforce
 *   read-with-intent-to-write, mirroring the contract used by
 *   `TransactionalRepository<TEntity>`.
 */
export interface InstanceSettingsRepository {
  get(): Promise<{
    readonly entity: InstanceSettings;
    readonly expectedVersion: ExpectedVersion<InstanceSettings>;
  }>;
  save(
    entity: InstanceSettings,
    expectedVersion: ExpectedVersion<InstanceSettings>,
  ): Promise<void>;
}
