import { and, eq, sql } from "drizzle-orm";
import { SystemError, SystemErrorCode } from "@/core/application/errors";
import { isRehydrationError, RehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { TagBlacklistRepository } from "@/core/domain/tag/ports/tagBlacklistRepository";
import { type TagBlacklistEntry, TagName } from "@/core/domain/tag/valueObject";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { tagBlacklist } from "../schema";
import { mapDbError } from "./helpers";

type TagBlacklistRow = typeof tagBlacklist.$inferSelect;

/**
 * Folds a `TagName` (already NFKC-normalised) to lower case for the
 * `name_normalized` storage column. Mirrors `D1TagRepository` so the
 * two ports agree on the canonical form used for cross-checks.
 */
function normalizeName(name: TagName): string {
  return (name as string).toLowerCase();
}

/**
 * D1 implementation of `TagBlacklistRepository`.
 *
 * Entries are value objects keyed by `(ownerId, name_normalized)`. There
 * is no surrogate id and no OCC — the port semantics treat `add` as
 * idempotent (re-adding the same entry is a no-op) so the adapter uses
 * `INSERT ... ON CONFLICT DO NOTHING` rather than the OCC-guarded
 * deferred-batch path.
 *
 * `name` is reconstructed via `TagName.create` so adapter-level rows
 * still flow through the value-object invariant on read. A row that
 * fails reconstruction is surfaced as
 * `SystemError(DataIntegrityError)`.
 */
export class D1TagBlacklistRepository implements TagBlacklistRepository {
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
  ) {}

  private toEntry(row: TagBlacklistRow): TagBlacklistEntry {
    try {
      return {
        ownerId: row.ownerId as UserId,
        name: TagName.create(row.nameNormalized),
        addedAt: new Date(row.addedAt),
      };
    } catch (error) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored tag blacklist entry violates invariants (ownerId=${row.ownerId}, name=${row.nameNormalized})`,
        isRehydrationError(error)
          ? error
          : new RehydrationError(
              "Failed to rehydrate TagBlacklistEntry",
              error,
            ),
      );
    }
  }

  isBlacklisted(ownerId: UserId, name: TagName): Promise<boolean> {
    return mapDbError("Failed to check tag blacklist", async () => {
      const rows = await this.db
        .select({ ownerId: tagBlacklist.ownerId })
        .from(tagBlacklist)
        .where(
          and(
            eq(tagBlacklist.ownerId, ownerId),
            eq(tagBlacklist.nameNormalized, normalizeName(name)),
          ),
        )
        .limit(1);
      return rows.length > 0;
    });
  }

  async add(entry: TagBlacklistEntry): Promise<void> {
    this.pending.add(
      this.db
        .insert(tagBlacklist)
        .values({
          ownerId: entry.ownerId,
          nameNormalized: normalizeName(entry.name),
          addedAt: entry.addedAt.toISOString(),
        })
        .onConflictDoNothing({
          target: [tagBlacklist.ownerId, tagBlacklist.nameNormalized],
        }),
    );
  }

  async remove(ownerId: UserId, name: TagName): Promise<void> {
    this.pending.add(
      this.db
        .delete(tagBlacklist)
        .where(
          and(
            eq(tagBlacklist.ownerId, ownerId),
            eq(tagBlacklist.nameNormalized, normalizeName(name)),
          ),
        ),
    );
  }

  listByOwner(ownerId: UserId): Promise<readonly TagBlacklistEntry[]> {
    return mapDbError("Failed to list tag blacklist", async () => {
      const rows = await this.db
        .select()
        .from(tagBlacklist)
        .where(eq(tagBlacklist.ownerId, ownerId))
        .orderBy(sql`${tagBlacklist.addedAt} DESC`);
      return rows.map((row) => this.toEntry(row));
    });
  }
}
