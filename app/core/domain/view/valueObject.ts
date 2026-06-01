import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { BusinessRuleError } from "@/core/domain/error";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { PublicationVisibility } from "@/core/domain/publication/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { ViewErrorCode } from "./errorCode";

export const SAVED_VIEW_NAME_MAX_LENGTH = 60;
const KEYWORD_MAX_LENGTH = 200;

declare const savedViewIdBrand: unique symbol;
declare const savedViewNameBrand: unique symbol;
declare const viewKeywordBrand: unique symbol;

/**
 * Opaque identifier for a `SavedView`. As with other aggregate ids in
 * this template, the domain treats the value as a non-empty string;
 * format (UUIDv7) is owned by `IdGenerator` and re-validated by storage
 * adapters on rehydration.
 */
export type SavedViewId = string & { readonly [savedViewIdBrand]: true };

export const SavedViewId = {
  create: (id: string): SavedViewId => {
    const trimmed = id.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        ViewErrorCode.InvalidId,
        "Invalid saved view id",
      );
    }
    return trimmed as SavedViewId;
  },
};

/**
 * Display name of a `SavedView`. Trimmed, 1..60 characters. Equality is
 * case-insensitive so that `ensureSingleDefault` / `assertNameUnique`
 * can treat name collisions consistently with how users perceive them.
 */
export type SavedViewName = string & { readonly [savedViewNameBrand]: true };

export const SavedViewName = {
  create: (raw: string): SavedViewName => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        ViewErrorCode.NameEmpty,
        "Saved view name cannot be empty",
      );
    }
    if (trimmed.length > SAVED_VIEW_NAME_MAX_LENGTH) {
      throw new BusinessRuleError(
        ViewErrorCode.NameTooLong,
        `Saved view name exceeds maximum length (${SAVED_VIEW_NAME_MAX_LENGTH})`,
      );
    }
    return trimmed as SavedViewName;
  },
  equals: (a: SavedViewName, b: SavedViewName): boolean =>
    a.toLowerCase() === b.toLowerCase(),
};

export type ViewKind = "personal" | "public";

const VIEW_KINDS: ReadonlySet<ViewKind> = new Set([
  "personal",
  "public",
] satisfies ViewKind[]);

export const ViewKind = {
  create: (raw: string): ViewKind => {
    if (!VIEW_KINDS.has(raw as ViewKind)) {
      throw new BusinessRuleError(
        ViewErrorCode.InvalidKind,
        `Invalid view kind: ${raw}`,
      );
    }
    return raw as ViewKind;
  },
};

export type DisplayMode = "list" | "tile" | "calendar";

const DISPLAY_MODES: ReadonlySet<DisplayMode> = new Set([
  "list",
  "tile",
  "calendar",
] satisfies DisplayMode[]);

export const DisplayMode = {
  create: (raw: string): DisplayMode => {
    if (!DISPLAY_MODES.has(raw as DisplayMode)) {
      throw new BusinessRuleError(
        ViewErrorCode.InvalidDisplayMode,
        `Invalid display mode: ${raw}`,
      );
    }
    return raw as DisplayMode;
  },
};

export type CalendarDateKey = "updated" | "created" | "frontMatterDate";

const CALENDAR_DATE_KEYS: ReadonlySet<CalendarDateKey> = new Set([
  "updated",
  "created",
  "frontMatterDate",
] satisfies CalendarDateKey[]);

export const CalendarDateKey = {
  create: (raw: string): CalendarDateKey => {
    if (!CALENDAR_DATE_KEYS.has(raw as CalendarDateKey)) {
      throw new BusinessRuleError(
        ViewErrorCode.InvalidCalendarDateKey,
        `Invalid calendar date key: ${raw}`,
      );
    }
    return raw as CalendarDateKey;
  },
};

export type SortBy = "updatedAt" | "createdAt" | "title";

const SORT_BYS: ReadonlySet<SortBy> = new Set([
  "updatedAt",
  "createdAt",
  "title",
] satisfies SortBy[]);

export const SortBy = {
  create: (raw: string): SortBy => {
    if (!SORT_BYS.has(raw as SortBy)) {
      throw new BusinessRuleError(
        ViewErrorCode.InvalidSortBy,
        `Invalid sort by: ${raw}`,
      );
    }
    return raw as SortBy;
  },
};

export type SortDirection = "asc" | "desc";

const SORT_DIRECTIONS: ReadonlySet<SortDirection> = new Set([
  "asc",
  "desc",
] satisfies SortDirection[]);

export const SortDirection = {
  create: (raw: string): SortDirection => {
    if (!SORT_DIRECTIONS.has(raw as SortDirection)) {
      throw new BusinessRuleError(
        ViewErrorCode.InvalidSortDirection,
        `Invalid sort direction: ${raw}`,
      );
    }
    return raw as SortDirection;
  },
};

export type ViewSort = Readonly<{
  by: SortBy;
  direction: SortDirection;
}>;

export const ViewSort = {
  create: (params: { by: SortBy; direction: SortDirection }): ViewSort => ({
    by: params.by,
    direction: params.direction,
  }),
  equals: (a: ViewSort, b: ViewSort): boolean =>
    a.by === b.by && a.direction === b.direction,
};

/**
 * Inclusive half-open date filter. Both bounds are optional but at least
 * one must be provided — a fully `null` range carries no information and
 * is rejected at construction time. When both bounds are set, `from`
 * must be less than or equal to `to`.
 */
export type DateRange = Readonly<{
  from: Date | null;
  to: Date | null;
}>;

export const DateRange = {
  create: (params: { from: Date | null; to: Date | null }): DateRange => {
    if (params.from === null && params.to === null) {
      throw new BusinessRuleError(
        ViewErrorCode.InvalidDateRange,
        "DateRange must have at least one bound",
      );
    }
    if (
      params.from !== null &&
      params.to !== null &&
      params.from.getTime() > params.to.getTime()
    ) {
      throw new BusinessRuleError(
        ViewErrorCode.InvalidDateRange,
        "DateRange `from` must be on or before `to`",
      );
    }
    return { from: params.from, to: params.to };
  },
  equals: (a: DateRange, b: DateRange): boolean => {
    const fromEq =
      a.from === null
        ? b.from === null
        : b.from !== null && a.from.getTime() === b.from.getTime();
    if (!fromEq) {
      return false;
    }
    return a.to === null
      ? b.to === null
      : b.to !== null && a.to.getTime() === b.to.getTime();
  },
};

export type ViewKeyword = string & { readonly [viewKeywordBrand]: true };

export const ViewKeyword = {
  create: (raw: string): ViewKeyword => {
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      throw new BusinessRuleError(
        ViewErrorCode.KeywordEmpty,
        "Keyword cannot be empty",
      );
    }
    if (trimmed.length > KEYWORD_MAX_LENGTH) {
      throw new BusinessRuleError(
        ViewErrorCode.KeywordTooLong,
        `Keyword exceeds maximum length (${KEYWORD_MAX_LENGTH})`,
      );
    }
    return trimmed as ViewKeyword;
  },
};

/**
 * Composite filter describing what notes a `SavedView` matches.
 *
 * All fields are optional — `null` / empty array means "no filter on
 * this axis". `tagIds` and `visibilityFilter` are order-insensitive but
 * materialised as frozen arrays; duplicates are collapsed at
 * construction time so equality is structural.
 *
 * `visibilityFilter` mirrors the multi-valued `tagIds` convention rather
 * than the port-level `undefined | []` distinction used by
 * `NoteOwnerListOpts.visibility`. The selector boundary translates an
 * empty array to `undefined` before passing through to the list usecase
 * (see `.issue/31/adr.md` ADR-001).
 */
export type ViewQuery = Readonly<{
  directoryId: DirectoryId | null;
  tagIds: readonly TagId[];
  dateRange: DateRange | null;
  keyword: ViewKeyword | null;
  referencingNoteId: NoteId | null;
  visibilityFilter: readonly PublicationVisibility[];
}>;

export const ViewQuery = {
  create: (params: {
    directoryId: DirectoryId | null;
    tagIds: readonly TagId[];
    dateRange: DateRange | null;
    keyword: ViewKeyword | null;
    referencingNoteId: NoteId | null;
    visibilityFilter: readonly PublicationVisibility[];
  }): ViewQuery => {
    const seen = new Set<string>();
    const unique: TagId[] = [];
    for (const tagId of params.tagIds) {
      if (!seen.has(tagId)) {
        seen.add(tagId);
        unique.push(tagId);
      }
    }
    const seenVis = new Set<PublicationVisibility>();
    const uniqueVis: PublicationVisibility[] = [];
    for (const v of params.visibilityFilter) {
      if (!seenVis.has(v)) {
        seenVis.add(v);
        uniqueVis.push(v);
      }
    }
    return {
      directoryId: params.directoryId,
      tagIds: Object.freeze(unique),
      dateRange: params.dateRange,
      keyword: params.keyword,
      referencingNoteId: params.referencingNoteId,
      visibilityFilter: Object.freeze(uniqueVis),
    };
  },

  empty: (): ViewQuery => ({
    directoryId: null,
    tagIds: Object.freeze([]),
    dateRange: null,
    keyword: null,
    referencingNoteId: null,
    visibilityFilter: Object.freeze([]),
  }),

  equals: (a: ViewQuery, b: ViewQuery): boolean => {
    if (a.directoryId !== b.directoryId) {
      return false;
    }
    if (a.referencingNoteId !== b.referencingNoteId) {
      return false;
    }
    if (a.keyword !== b.keyword) {
      return false;
    }
    if (a.tagIds.length !== b.tagIds.length) {
      return false;
    }
    for (let i = 0; i < a.tagIds.length; i += 1) {
      if (a.tagIds[i] !== b.tagIds[i]) {
        return false;
      }
    }
    if (a.visibilityFilter.length !== b.visibilityFilter.length) {
      return false;
    }
    for (let i = 0; i < a.visibilityFilter.length; i += 1) {
      if (a.visibilityFilter[i] !== b.visibilityFilter[i]) {
        return false;
      }
    }
    if (a.dateRange === null) {
      return b.dateRange === null;
    }
    return b.dateRange !== null && DateRange.equals(a.dateRange, b.dateRange);
  },
};

/**
 * Marker recording that a `SavedView`'s `ViewQuery` referenced an entity
 * that no longer exists (or is no longer visible to the owner). The
 * `lastSeenAt` timestamp captures when the broken reference was first
 * detected so the UI can offer "stale since ..." messaging without
 * persisting redundant audit rows.
 *
 * `lastSeenName` snapshots the referenced entity's display name at the
 * moment the reference broke. Because tag / directory / note are
 * hard-deleted (or purged), the name cannot be resolved at display time;
 * the delete-event path snaps it here (Issue #405 ADR-A). The
 * `detectBrokenConditions` re-scan path has no name to offer and passes
 * an empty string — `markBroken` is careful not to let that empty value
 * clobber a previously-captured name (ADR-B).
 */
export type BrokenConditionMarker =
  | Readonly<{ kind: "tag"; id: TagId; lastSeenName: string; lastSeenAt: Date }>
  | Readonly<{
      kind: "directory";
      id: DirectoryId;
      lastSeenName: string;
      lastSeenAt: Date;
    }>
  | Readonly<{
      kind: "note";
      id: NoteId;
      lastSeenName: string;
      lastSeenAt: Date;
    }>;

const BROKEN_MARKER_KINDS: ReadonlySet<BrokenConditionMarker["kind"]> = new Set(
  ["tag", "directory", "note"] satisfies BrokenConditionMarker["kind"][],
);

export const BrokenConditionMarker = {
  tag: (
    id: TagId,
    lastSeenName: string,
    lastSeenAt: Date,
  ): BrokenConditionMarker => ({
    kind: "tag",
    id,
    lastSeenName,
    lastSeenAt,
  }),
  directory: (
    id: DirectoryId,
    lastSeenName: string,
    lastSeenAt: Date,
  ): BrokenConditionMarker => ({
    kind: "directory",
    id,
    lastSeenName,
    lastSeenAt,
  }),
  note: (
    id: NoteId,
    lastSeenName: string,
    lastSeenAt: Date,
  ): BrokenConditionMarker => ({
    kind: "note",
    id,
    lastSeenName,
    lastSeenAt,
  }),

  /**
   * Validate the discriminator received from at-rest storage. Adapters
   * pass the raw string from a persistence row; this guard converts an
   * unknown value into the narrowed literal type.
   */
  createKind: (raw: string): BrokenConditionMarker["kind"] => {
    if (!BROKEN_MARKER_KINDS.has(raw as BrokenConditionMarker["kind"])) {
      throw new BusinessRuleError(
        ViewErrorCode.InvalidBrokenMarkerKind,
        `Invalid broken-condition marker kind: ${raw}`,
      );
    }
    return raw as BrokenConditionMarker["kind"];
  },

  /**
   * Identity is (kind, id) only — `lastSeenName` and `lastSeenAt` are
   * not part of equality so a re-detection (which carries a fresh
   * timestamp and possibly no name) is recognised as the same broken
   * reference rather than a distinct one (Issue #405 ADR-B).
   */
  equals: (a: BrokenConditionMarker, b: BrokenConditionMarker): boolean =>
    a.kind === b.kind && a.id === b.id,
};
