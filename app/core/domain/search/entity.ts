import { RehydrationError } from "@/core/domain/error";
import { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import {
  IndexJobAttempts,
  IndexJobId,
  IndexJobLastError,
  IndexJobOp,
  SearchBody,
  SearchDirectoryPath,
  SearchTitle,
  Visibility,
} from "./valueObject";

/**
 * Upstream-emitted snapshot of a note. The Note domain (or its outbox
 * consumer) hands this to the Search domain via `SearchDocument.fromSnapshot`
 * — the Search domain does not pull from `NoteRepository`.
 */
export type NoteSnapshot = Readonly<{
  noteId: NoteId;
  ownerId: UserId;
  visibility: Visibility;
  title: string;
  plainBody: string;
  tagNames: readonly string[];
  directoryPath: string;
  frontMatterDate: Date | null;
  updatedAt: Date;
}>;

/**
 * Aggregate root representing a single indexed note.
 *
 * - `noteId` is the aggregate id (no surrogate key).
 * - `dateForCalendar` resolves to `frontMatterDate` when present,
 *   otherwise falls back to `updatedAt`.
 * - `indexedAt` is the wall-clock at which this document was last
 *   handed to the index. The Search domain never reads `Date.now()`
 *   itself; the caller provides `now` to `fromSnapshot`.
 *
 * SearchDocument has no own version field — its lifecycle is driven by
 * Note's outbox stream and the underlying `SearchIndex` is a derived
 * projection that the upstream truth source can always rebuild. OCC is
 * intentionally absent.
 */
export type SearchDocument = Readonly<{
  noteId: NoteId;
  ownerId: UserId;
  visibility: Visibility;
  title: SearchTitle;
  body: SearchBody;
  tagNames: readonly string[];
  directoryPath: SearchDirectoryPath;
  dateForCalendar: Date;
  updatedAt: Date;
  indexedAt: Date;
}>;

/** Tombstone marker returned by `markRemoved` — there is no removed-document entity. */
export type SearchDocumentTombstone = Readonly<{
  tombstone: true;
  noteId: NoteId;
  removedAt: Date;
}>;

// Persistence rows are untrusted; each field is re-validated through its
// value object and any failure is wrapped in `RehydrationError`.
type SearchDocumentReconstructInput = Readonly<{
  noteId: NoteId;
  ownerId: string;
  visibility: string;
  title: string;
  body: string;
  tagNames: readonly string[];
  directoryPath: string;
  dateForCalendar: Date;
  updatedAt: Date;
  indexedAt: Date;
}>;

export const SearchDocument = {
  /**
   * Static factory: project a `NoteSnapshot` into a `SearchDocument`.
   *
   * `dateForCalendar` resolves to the snapshot's `frontMatterDate` when
   * present and to `updatedAt` otherwise — the public calendar view
   * uses this single field so the index never has to branch.
   */
  fromSnapshot: (snapshot: NoteSnapshot, now: Date): SearchDocument => {
    return {
      noteId: snapshot.noteId,
      ownerId: snapshot.ownerId,
      visibility: snapshot.visibility,
      title: SearchTitle.create(snapshot.title),
      body: SearchBody.create(snapshot.plainBody),
      tagNames: [...snapshot.tagNames],
      directoryPath: SearchDirectoryPath.create(snapshot.directoryPath),
      dateForCalendar: snapshot.frontMatterDate ?? snapshot.updatedAt,
      updatedAt: snapshot.updatedAt,
      indexedAt: now,
    };
  },

  /**
   * Returns a tombstone marker for `noteId`. The Search domain does not
   * model "removed documents" as an entity — the marker exists so the
   * service can hand it to `index.delete` while remaining a pure
   * function (no `new Date()` inside the domain).
   */
  markRemoved: (noteId: NoteId, now: Date): SearchDocumentTombstone => ({
    tombstone: true,
    noteId,
    removedAt: now,
  }),

  reconstruct: (input: SearchDocumentReconstructInput): SearchDocument => {
    try {
      return {
        noteId: input.noteId,
        ownerId: UserId.create(input.ownerId),
        visibility: Visibility.create(input.visibility),
        title: SearchTitle.create(input.title),
        body: SearchBody.create(input.body),
        tagNames: [...input.tagNames],
        directoryPath: SearchDirectoryPath.create(input.directoryPath),
        dateForCalendar: input.dateForCalendar,
        updatedAt: input.updatedAt,
        indexedAt: input.indexedAt,
      };
    } catch (error) {
      throw new RehydrationError(
        `Failed to rehydrate SearchDocument (noteId=${input.noteId})`,
        error,
      );
    }
  },
};

/**
 * Queued index update.
 *
 * `IndexJob` is its own aggregate. It carries no OCC version because
 * the queue semantics (claim, complete, fail) are owned by the
 * `IndexJobRepository` adapter — the row is mutated through dedicated
 * verbs rather than read-modify-write of the aggregate state.
 */
export type IndexJob = Readonly<{
  id: IndexJobId;
  noteId: NoteId;
  op: IndexJobOp;
  attempts: IndexJobAttempts;
  lastError: IndexJobLastError | null;
  enqueuedAt: Date;
}>;

type IndexJobReconstructInput = Readonly<{
  id: string;
  noteId: NoteId;
  op: string;
  attempts: number;
  lastError: string | null;
  enqueuedAt: Date;
}>;

export const IndexJob = {
  create: (
    params: { id: string; noteId: NoteId; op: IndexJobOp },
    now: Date,
  ): IndexJob => ({
    id: IndexJobId.create(params.id),
    noteId: params.noteId,
    op: params.op,
    attempts: IndexJobAttempts.zero(),
    lastError: null,
    enqueuedAt: now,
  }),

  /**
   * Records a dispatch attempt. `error === null` signals a successful
   * dispatch (the caller will follow up by removing the job via
   * `IndexJobRepository.complete`); a string error increments
   * `attempts` and stamps `lastError`.
   *
   * `now` is currently unused by this transition — `enqueuedAt` is
   * immutable — but is kept on the signature so callers thread `now`
   * uniformly and so future fields like `lastAttemptedAt` can be added
   * without churning the call sites.
   */
  recordAttempt: (
    job: IndexJob,
    error: string | null,
    _now: Date,
  ): IndexJob => ({
    ...job,
    attempts: IndexJobAttempts.next(job.attempts),
    lastError: error === null ? null : IndexJobLastError.create(error),
  }),

  reconstruct: (input: IndexJobReconstructInput): IndexJob => {
    try {
      return {
        id: IndexJobId.create(input.id),
        noteId: input.noteId,
        op: IndexJobOp.create(input.op),
        attempts: IndexJobAttempts.create(input.attempts),
        lastError:
          input.lastError === null
            ? null
            : IndexJobLastError.create(input.lastError),
        enqueuedAt: input.enqueuedAt,
      };
    } catch (error) {
      throw new RehydrationError(
        `Failed to rehydrate IndexJob (id=${input.id})`,
        error,
      );
    }
  },
};
