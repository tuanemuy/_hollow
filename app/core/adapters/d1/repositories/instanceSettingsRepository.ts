import { and, eq } from "drizzle-orm";
import {
  ConflictError,
  SystemError,
  SystemErrorCode,
} from "@/core/application/errors";
import type { Clock } from "@/core/application/ports/clock";
import {
  INSTANCE_SETTINGS_ID,
  InstanceSettings,
} from "@/core/domain/adminSettings/entity";
import type { InstanceSettingsRepository } from "@/core/domain/adminSettings/ports/instanceSettingsRepository";
import type {
  ExpectedVersion,
  Versioned,
} from "@/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@/core/domain/error";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { instanceSettings } from "../schema";
import { mapDbError } from "./helpers";

type InstanceSettingsRow = typeof instanceSettings.$inferSelect;

type PromptJsonEntry = Readonly<{
  text: string;
  expectedVariables: readonly string[];
}>;

type PromptsJson = Readonly<Record<string, PromptJsonEntry>>;
type DesignTokensJson = Readonly<{ tokens: Record<string, string> }>;
type LimitsJson = Readonly<{
  maxUploadBytesPerDay: number;
  maxIngestionBytes: number;
  maxNoteBytes: number;
  maxExportArtifactBytes: number;
  maxShareLinksPerNote: number;
  editLockTtlSec: number;
  trashRetentionDays: number;
}>;

function parseJson<T>(field: string, raw: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Stored instance_settings.${field} is not valid JSON`,
      error,
    );
  }
}

/**
 * D1 implementation of `InstanceSettingsRepository`. Singleton aggregate
 * with `id = 'singleton'` enforced by a CHECK constraint at the schema
 * level. Reads execute immediately against the binding; writes register
 * Drizzle query expressions on the supplied `PendingBatch` so the
 * surrounding `D1UnitOfWorkProvider` flushes them atomically via
 * `db.batch()`.
 *
 * Differences from `TransactionalRepository`:
 * - `get()` never returns `null` — when the row is missing, it
 *   materializes `InstanceSettings.default(now)` so callers don't have
 *   to special-case "first time".
 * - `save()` is the only write path. For the first persisted save
 *   (`expectedVersion === 0`) it issues an `INSERT ... ON CONFLICT DO
 *   NOTHING` so the singleton row is materialized exactly once even if
 *   two concurrent requests both saw `expectedVersion === 0`, then
 *   guards the subsequent `UPDATE` with the OCC check that converts a
 *   zero-row update into a `ConflictError("OPTIMISTIC_LOCK_FAILURE")`.
 *
 * OCC is enforced by the `ExpectedVersion<InstanceSettings>` token
 * returned from `get()`. This file is the only legitimate construction
 * site for the token (via the `as` cast inside `toVersioned`).
 */
export class D1InstanceSettingsRepository
  implements InstanceSettingsRepository
{
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
    private readonly clock: Clock,
  ) {}

  private toEntity(row: InstanceSettingsRow): InstanceSettings {
    try {
      return InstanceSettings.reconstruct({
        llm: {
          provider: row.llmProvider,
          model: row.llmModel,
          apiKeySource: row.llmApiKeySource,
          apiKeyCiphertext: row.llmApiKeyCiphertext,
        },
        prompts: parseJson<PromptsJson>("prompts_json", row.promptsJson),
        designTokens: parseJson<DesignTokensJson>(
          "design_tokens_json",
          row.designTokensJson,
        ),
        registration: {
          open: row.registrationOpen !== 0,
          closedReason: row.registrationClosedReason,
        },
        limits: parseJson<LimitsJson>("limits_json", row.limitsJson),
        version: row.version,
        updatedAt: new Date(row.updatedAt),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored instance_settings violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private toVersioned(row: InstanceSettingsRow): Versioned<InstanceSettings> {
    return {
      entity: this.toEntity(row),
      expectedVersion: row.version as ExpectedVersion<InstanceSettings>,
    };
  }

  get(): Promise<Versioned<InstanceSettings>> {
    return mapDbError("Failed to load instance settings", async () => {
      const rows = await this.db
        .select()
        .from(instanceSettings)
        .where(eq(instanceSettings.id, INSTANCE_SETTINGS_ID))
        .limit(1);
      const row = rows[0];
      if (row) {
        return this.toVersioned(row);
      }
      const fallback = InstanceSettings.default(this.clock.now());
      return {
        entity: fallback,
        expectedVersion: 0 as ExpectedVersion<InstanceSettings>,
      };
    });
  }

  async save(
    entity: InstanceSettings,
    expectedVersion: ExpectedVersion<InstanceSettings>,
  ): Promise<void> {
    const promptsJson: PromptsJson = Object.fromEntries(
      Object.entries(entity.prompts).map(([purpose, template]) => [
        purpose,
        {
          text: template.text,
          expectedVariables: template.expectedVariables,
        },
      ]),
    );
    const designTokensJson: DesignTokensJson = {
      tokens: { ...entity.designTokens.tokens },
    };
    const limitsJson: LimitsJson = {
      maxUploadBytesPerDay: entity.limits.maxUploadBytesPerDay,
      maxIngestionBytes: entity.limits.maxIngestionBytes,
      maxNoteBytes: entity.limits.maxNoteBytes,
      maxExportArtifactBytes: entity.limits.maxExportArtifactBytes,
      maxShareLinksPerNote: entity.limits.maxShareLinksPerNote,
      editLockTtlSec: entity.limits.editLockTtlSec,
      trashRetentionDays: entity.limits.trashRetentionDays,
    };
    const updatedAtIso = entity.updatedAt.toISOString();

    if ((expectedVersion as number) === 0) {
      // Singleton bootstrap path. `INSERT … ON CONFLICT DO NOTHING`
      // ensures the row exists exactly once even if two concurrent
      // requests both observed an empty table; the subsequent OCC
      // update enforces the "no concurrent write" invariant.
      this.pending.add(
        this.db
          .insert(instanceSettings)
          .values({
            id: INSTANCE_SETTINGS_ID,
            llmProvider: entity.llm.provider,
            llmModel: entity.llm.model,
            llmApiKeySource: entity.llm.apiKeySource,
            llmApiKeyCiphertext: entity.llm.apiKeyCiphertext,
            promptsJson: JSON.stringify(promptsJson),
            designTokensJson: JSON.stringify(designTokensJson),
            registrationOpen: entity.registration.open ? 1 : 0,
            registrationClosedReason: entity.registration.closedReason,
            limitsJson: JSON.stringify(limitsJson),
            version: 0,
            updatedAt: updatedAtIso,
          })
          .onConflictDoNothing({ target: instanceSettings.id }),
      );
    }

    this.pending.addOcc(
      this.db
        .update(instanceSettings)
        .set({
          llmProvider: entity.llm.provider,
          llmModel: entity.llm.model,
          llmApiKeySource: entity.llm.apiKeySource,
          llmApiKeyCiphertext: entity.llm.apiKeyCiphertext,
          promptsJson: JSON.stringify(promptsJson),
          designTokensJson: JSON.stringify(designTokensJson),
          registrationOpen: entity.registration.open ? 1 : 0,
          registrationClosedReason: entity.registration.closedReason,
          limitsJson: JSON.stringify(limitsJson),
          version: entity.version,
          updatedAt: updatedAtIso,
        })
        .where(
          and(
            eq(instanceSettings.id, INSTANCE_SETTINGS_ID),
            eq(instanceSettings.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while saving instance settings: expected version ${expectedVersion}`,
        );
      },
    );
  }
}
