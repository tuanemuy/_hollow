import { and, eq } from "drizzle-orm";
import {
  ConflictError,
  SystemError,
  SystemErrorCode,
} from "@/core/application/errors";
import type { IdGenerator } from "@/core/application/ports/idGenerator";
import type {
  ExpectedVersion,
  Versioned,
} from "@/core/domain/common/transactionalRepository";
import { isRehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { SavedView } from "@/core/domain/view/entity";
import type { SavedViewRepository } from "@/core/domain/view/ports/savedViewRepository";
import type { SavedViewName, ViewKind } from "@/core/domain/view/valueObject";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { savedViews } from "../schema";
import { mapDbError } from "./helpers";

type SavedViewRow = typeof savedViews.$inferSelect;

// Shapes of the JSON columns at-rest. Decoded by `JSON.parse` into
// `unknown`, then narrowed via runtime guards before being handed to
// `SavedView.reconstruct`, which re-validates every field through its
// value object. Any shape drift surfaces as `RehydrationError` →
// `SystemError(DataIntegrityError)`.
type StoredQueryJson = Readonly<{
  directoryId: string | null;
  tagIds: readonly string[];
  dateRange: Readonly<{
    from: string | null;
    to: string | null;
  }> | null;
  keyword: string | null;
  referencingNoteId: string | null;
}>;

type StoredSortJson = Readonly<{
  by: string;
  direction: string;
}>;

type StoredBrokenConditionJson = Readonly<{
  kind: string;
  id: string;
  lastSeenAt: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function decodeQueryJson(raw: string, viewId: string): StoredQueryJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Saved view ${viewId} has malformed query_json`,
      error,
    );
  }
  if (!isRecord(parsed)) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Saved view ${viewId} query_json is not an object`,
    );
  }
  const directoryId = parsed.directoryId;
  const tagIds = parsed.tagIds;
  const dateRange = parsed.dateRange;
  const keyword = parsed.keyword;
  const referencingNoteId = parsed.referencingNoteId;

  if (directoryId !== null && typeof directoryId !== "string") {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Saved view ${viewId} query_json.directoryId is not a string|null`,
    );
  }
  if (!isStringArray(tagIds)) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Saved view ${viewId} query_json.tagIds is not string[]`,
    );
  }
  if (keyword !== null && typeof keyword !== "string") {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Saved view ${viewId} query_json.keyword is not a string|null`,
    );
  }
  if (referencingNoteId !== null && typeof referencingNoteId !== "string") {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Saved view ${viewId} query_json.referencingNoteId is not a string|null`,
    );
  }

  let dateRangeOut: StoredQueryJson["dateRange"] = null;
  if (dateRange !== null) {
    if (!isRecord(dateRange)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Saved view ${viewId} query_json.dateRange is not an object|null`,
      );
    }
    const from = dateRange.from;
    const to = dateRange.to;
    if (from !== null && typeof from !== "string") {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Saved view ${viewId} query_json.dateRange.from is not a string|null`,
      );
    }
    if (to !== null && typeof to !== "string") {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Saved view ${viewId} query_json.dateRange.to is not a string|null`,
      );
    }
    dateRangeOut = { from, to };
  }

  return {
    directoryId,
    tagIds,
    dateRange: dateRangeOut,
    keyword,
    referencingNoteId,
  };
}

function decodeSortJson(raw: string, viewId: string): StoredSortJson {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Saved view ${viewId} has malformed sort_json`,
      error,
    );
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.by !== "string" ||
    typeof parsed.direction !== "string"
  ) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Saved view ${viewId} sort_json shape mismatch`,
    );
  }
  return { by: parsed.by, direction: parsed.direction };
}

function decodeBrokenConditionsJson(
  raw: string,
  viewId: string,
): readonly StoredBrokenConditionJson[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Saved view ${viewId} has malformed broken_conditions_json`,
      error,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Saved view ${viewId} broken_conditions_json is not an array`,
    );
  }
  return parsed.map((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.kind !== "string" ||
      typeof entry.id !== "string" ||
      typeof entry.lastSeenAt !== "string"
    ) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Saved view ${viewId} broken_conditions_json[${index}] shape mismatch`,
      );
    }
    return {
      kind: entry.kind,
      id: entry.id,
      lastSeenAt: entry.lastSeenAt,
    };
  });
}

function parseStoredDate(value: string, context: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new SystemError(
      SystemErrorCode.DataIntegrityError,
      `Invalid ISO8601 timestamp in ${context}: ${value}`,
    );
  }
  return date;
}

function encodeQueryJson(view: SavedView): string {
  return JSON.stringify({
    directoryId: view.query.directoryId,
    tagIds: view.query.tagIds,
    dateRange:
      view.query.dateRange === null
        ? null
        : {
            from:
              view.query.dateRange.from === null
                ? null
                : view.query.dateRange.from.toISOString(),
            to:
              view.query.dateRange.to === null
                ? null
                : view.query.dateRange.to.toISOString(),
          },
    keyword: view.query.keyword,
    referencingNoteId: view.query.referencingNoteId,
  });
}

function encodeSortJson(view: SavedView): string {
  return JSON.stringify({ by: view.sort.by, direction: view.sort.direction });
}

function encodeBrokenConditionsJson(view: SavedView): string {
  return JSON.stringify(
    view.brokenConditions.map((marker) => ({
      kind: marker.kind,
      id: marker.id,
      lastSeenAt: marker.lastSeenAt.toISOString(),
    })),
  );
}

/**
 * D1 implementation of `SavedViewRepository`. Mirrors the deferred-batch
 * pattern in `D1TodoRepository`: reads run immediately, writes are
 * buffered onto a `PendingBatch` and flushed atomically by the
 * surrounding `D1UnitOfWorkProvider`.
 *
 * JSON columns (`query_json`, `sort_json`, `broken_conditions_json`)
 * are serialised on write and parsed + shape-validated on read; every
 * field is then re-validated through its value object inside
 * `SavedView.reconstruct`. Anything that drifts from the schema raises
 * `SystemError(DataIntegrityError)` — never silent coercion.
 *
 * OCC is enforced by the `version` column. `findById` is the only
 * legitimate construction site for `ExpectedVersion<SavedView>`.
 */
export class D1SavedViewRepository implements SavedViewRepository {
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
    private readonly idGenerator: IdGenerator,
  ) {}

  private toSavedView(row: SavedViewRow): SavedView {
    if (!this.idGenerator.validate(row.id)) {
      throw new SystemError(
        SystemErrorCode.DataIntegrityError,
        `Stored saved view has malformed id: ${row.id}`,
      );
    }
    const storedQuery = decodeQueryJson(row.queryJson, row.id);
    const storedSort = decodeSortJson(row.sortJson, row.id);
    const storedBroken = decodeBrokenConditionsJson(
      row.brokenConditionsJson,
      row.id,
    );

    try {
      return SavedView.reconstruct({
        id: row.id,
        ownerId: row.ownerId,
        name: row.name,
        kind: row.kind,
        query: {
          directoryId: storedQuery.directoryId,
          tagIds: storedQuery.tagIds,
          dateRange:
            storedQuery.dateRange === null
              ? null
              : {
                  from:
                    storedQuery.dateRange.from === null
                      ? null
                      : parseStoredDate(
                          storedQuery.dateRange.from,
                          `saved view ${row.id} query_json.dateRange.from`,
                        ),
                  to:
                    storedQuery.dateRange.to === null
                      ? null
                      : parseStoredDate(
                          storedQuery.dateRange.to,
                          `saved view ${row.id} query_json.dateRange.to`,
                        ),
                },
          keyword: storedQuery.keyword,
          referencingNoteId: storedQuery.referencingNoteId,
        },
        displayMode: row.displayMode,
        calendarDateKey: row.calendarDateKey,
        sort: { by: storedSort.by, direction: storedSort.direction },
        isDefault: row.isDefault === 1,
        brokenConditions: storedBroken.map((marker) => ({
          kind: marker.kind,
          id: marker.id,
          lastSeenAt: parseStoredDate(
            marker.lastSeenAt,
            `saved view ${row.id} broken_conditions_json.lastSeenAt`,
          ),
        })),
        version: row.version,
        createdAt: parseStoredDate(
          row.createdAt,
          `saved view ${row.id} created_at`,
        ),
        updatedAt: parseStoredDate(
          row.updatedAt,
          `saved view ${row.id} updated_at`,
        ),
      });
    } catch (error) {
      if (isRehydrationError(error)) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          `Stored saved view ${row.id} violates invariants`,
          error,
        );
      }
      throw error;
    }
  }

  private toVersioned(row: SavedViewRow): Versioned<SavedView> {
    return {
      entity: this.toSavedView(row),
      expectedVersion: row.version as ExpectedVersion<SavedView>,
    };
  }

  findById(id: string): Promise<Versioned<SavedView> | null> {
    return mapDbError("Failed to find saved view", async () => {
      const rows = await this.db
        .select()
        .from(savedViews)
        .where(eq(savedViews.id, id))
        .limit(1);
      const row = rows[0];
      return row ? this.toVersioned(row) : null;
    });
  }

  findByOwner(ownerId: UserId, kind: ViewKind): Promise<readonly SavedView[]> {
    return mapDbError("Failed to list saved views by owner", async () => {
      const rows = await this.db
        .select()
        .from(savedViews)
        .where(and(eq(savedViews.ownerId, ownerId), eq(savedViews.kind, kind)));
      return rows.map((row) => this.toSavedView(row));
    });
  }

  findDefault(ownerId: UserId, kind: ViewKind): Promise<SavedView | null> {
    return mapDbError("Failed to find default saved view", async () => {
      const rows = await this.db
        .select()
        .from(savedViews)
        .where(
          and(
            eq(savedViews.ownerId, ownerId),
            eq(savedViews.kind, kind),
            eq(savedViews.isDefault, 1),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row ? this.toSavedView(row) : null;
    });
  }

  findByName(
    ownerId: UserId,
    kind: ViewKind,
    name: SavedViewName,
  ): Promise<SavedView | null> {
    return mapDbError("Failed to find saved view by name", async () => {
      // Name uniqueness in the domain is case-insensitive
      // (`SavedViewName.equals`). The persistence layer mirrors that by
      // filtering on `lower(name) = lower(?)` so storage matches the
      // service-level `assertNameUnique` semantics.
      const rows = await this.db
        .select()
        .from(savedViews)
        .where(and(eq(savedViews.ownerId, ownerId), eq(savedViews.kind, kind)));
      const target = name.toLowerCase();
      const match = rows.find((row) => row.name.toLowerCase() === target);
      return match ? this.toSavedView(match) : null;
    });
  }

  async insert(view: SavedView): Promise<void> {
    this.pending.add(
      this.db.insert(savedViews).values({
        id: view.id,
        ownerId: view.ownerId,
        name: view.name,
        kind: view.kind,
        queryJson: encodeQueryJson(view),
        displayMode: view.displayMode,
        calendarDateKey: view.calendarDateKey,
        sortJson: encodeSortJson(view),
        isDefault: view.isDefault ? 1 : 0,
        brokenConditionsJson: encodeBrokenConditionsJson(view),
        version: view.version,
        createdAt: view.createdAt.toISOString(),
        updatedAt: view.updatedAt.toISOString(),
      }),
    );
  }

  async save(
    view: SavedView,
    expectedVersion: ExpectedVersion<SavedView>,
  ): Promise<void> {
    const viewId = view.id;
    this.pending.addOcc(
      this.db
        .update(savedViews)
        .set({
          name: view.name,
          kind: view.kind,
          queryJson: encodeQueryJson(view),
          displayMode: view.displayMode,
          calendarDateKey: view.calendarDateKey,
          sortJson: encodeSortJson(view),
          isDefault: view.isDefault ? 1 : 0,
          brokenConditionsJson: encodeBrokenConditionsJson(view),
          version: view.version,
          updatedAt: view.updatedAt.toISOString(),
        })
        .where(
          and(
            eq(savedViews.id, view.id),
            eq(savedViews.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while saving saved view ${viewId}: expected version ${expectedVersion}`,
        );
      },
    );
  }

  async delete(
    id: string,
    expectedVersion: ExpectedVersion<SavedView>,
  ): Promise<void> {
    this.pending.addOcc(
      this.db
        .delete(savedViews)
        .where(
          and(
            eq(savedViews.id, id),
            eq(savedViews.version, expectedVersion as number),
          ),
        ),
      () => {
        throw new ConflictError(
          "OPTIMISTIC_LOCK_FAILURE",
          `Optimistic lock failure while deleting saved view ${id}: expected version ${expectedVersion}`,
        );
      },
    );
  }
}
