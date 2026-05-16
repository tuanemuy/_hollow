import { and, eq } from "drizzle-orm";
import {
  ConflictError,
  SystemError,
  SystemErrorCode,
} from "@/core/application/errors";
import { UserPromptOverride } from "@/core/domain/adminSettings/entity";
import type { UserPromptOverrideRepository } from "@/core/domain/adminSettings/ports/userPromptOverrideRepository";
import type { UserId } from "@/core/domain/adminSettings/valueObject";
import type {
  ExpectedVersion,
  Versioned,
} from "@/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@/core/domain/error";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { userPromptOverrides } from "../schema";
import { mapDbError } from "./helpers";

type UserPromptOverrideRow = typeof userPromptOverrides.$inferSelect;

type PromptJsonEntry = Readonly<{
  text: string;
  expectedVariables: readonly string[];
}>;
type PromptsJson = Readonly<Record<string, PromptJsonEntry>>;

function parsePromptsJson(raw: string): PromptsJson {
  try {
    return JSON.parse(raw) as PromptsJson;
  } catch (error) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      "Stored user_prompt_overrides.prompts_json is not valid JSON",
      error,
    );
  }
}

/**
 * D1 implementation of `UserPromptOverrideRepository`. Keyed by
 * `ownerId` — each user owns at most one row. Reads execute immediately
 * against the binding; writes register Drizzle query expressions on the
 * supplied `PendingBatch` so the surrounding `D1UnitOfWorkProvider`
 * flushes them atomically via `db.batch()`.
 *
 * OCC is enforced by the `ExpectedVersion<UserPromptOverride>` token
 * returned from `findByOwner`. This file is the only legitimate
 * construction site for the token (via the `as` cast inside
 * `toVersioned`).
 */
export class D1UserPromptOverrideRepository
  implements UserPromptOverrideRepository
{
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
  ) {}

  private toEntity(row: UserPromptOverrideRow): UserPromptOverride {
    try {
      return UserPromptOverride.reconstruct({
        ownerId: row.ownerId,
        prompts: parsePromptsJson(row.promptsJson),
        version: row.version,
        updatedAt: new Date(row.updatedAt),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          "Stored user_prompt_overrides violates invariants",
          error,
        );
      }
      throw error;
    }
  }

  private toVersioned(
    row: UserPromptOverrideRow,
  ): Versioned<UserPromptOverride> {
    return {
      entity: this.toEntity(row),
      expectedVersion: row.version as ExpectedVersion<UserPromptOverride>,
    };
  }

  findByOwner(ownerId: UserId): Promise<Versioned<UserPromptOverride> | null> {
    return mapDbError("Failed to find user prompt override", async () => {
      const rows = await this.db
        .select()
        .from(userPromptOverrides)
        .where(eq(userPromptOverrides.ownerId, ownerId))
        .limit(1);
      const row = rows[0];
      return row ? this.toVersioned(row) : null;
    });
  }

  private serializePrompts(entity: UserPromptOverride): string {
    const json: Record<string, PromptJsonEntry> = {};
    for (const [purpose, template] of Object.entries(entity.prompts)) {
      if (template === undefined) continue;
      json[purpose] = {
        text: template.text,
        expectedVariables: template.expectedVariables,
      };
    }
    return JSON.stringify(json);
  }

  async insert(entity: UserPromptOverride): Promise<void> {
    this.pending.add(
      this.db.insert(userPromptOverrides).values({
        ownerId: entity.ownerId,
        promptsJson: this.serializePrompts(entity),
        version: entity.version,
        updatedAt: entity.updatedAt.toISOString(),
      }),
    );
  }

  async save(
    entity: UserPromptOverride,
    expectedVersion: ExpectedVersion<UserPromptOverride>,
  ): Promise<void> {
    const ownerId = entity.ownerId;
    this.pending.addOcc(
      this.db
        .update(userPromptOverrides)
        .set({
          promptsJson: this.serializePrompts(entity),
          version: entity.version,
          updatedAt: entity.updatedAt.toISOString(),
        })
        .where(
          and(
            eq(userPromptOverrides.ownerId, ownerId),
            eq(userPromptOverrides.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while saving user prompt override ${ownerId}: expected version ${expectedVersion}`,
        );
      },
    );
  }

  async delete(
    ownerId: UserId,
    expectedVersion: ExpectedVersion<UserPromptOverride>,
  ): Promise<void> {
    this.pending.addOcc(
      this.db
        .delete(userPromptOverrides)
        .where(
          and(
            eq(userPromptOverrides.ownerId, ownerId),
            eq(userPromptOverrides.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while deleting user prompt override ${ownerId}: expected version ${expectedVersion}`,
        );
      },
    );
  }
}
