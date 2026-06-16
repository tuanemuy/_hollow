import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DomainEvent, EventId } from "@/core/domain/common/event";
import type { ExportJobId } from "@/core/domain/export/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import { LLMRateLimitError } from "@/core/domain/ingestion/ports/llmProvider";
import type {
  IngestionJobId as IngestionJobIdBrand,
  SourceFileKind,
} from "@/core/domain/ingestion/valueObject";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import type { Note } from "@/core/domain/note/entity";
import type { NoteId, NoteTitle } from "@/core/domain/note/valueObject";
import type {
  PublicationVisibility,
  ShareLinkId,
} from "@/core/domain/publication/valueObject";
import type { NoteSnapshot } from "@/core/domain/search/entity";
import type { TagId } from "@/core/domain/tag/valueObject";
import type { ConsumerContainer } from "../../di/types";
import { NotFoundError } from "../../errors";
import { handleUserDeletedEvent as exportHandleUserDeletedEvent } from "../../export/handleUserDeletedEvent";
import { runExportJob } from "../../export/runExportJob";
import { runIngestionJob } from "../../ingestion/runIngestionJob";
import { handleNotePurgedEvent as mediaHandleNotePurgedEvent } from "../../media/handleNotePurgedEvent";
import { handleLinkTargetResolution } from "../../note/handleLinkTargetResolution";
import { handleLinkTargetTrashed } from "../../note/handleLinkTargetTrashed";
import type { Logger } from "../../ports/logger";
import { handleNotePurgedEvent as publicationHandleNotePurgedEvent } from "../../publication/handleNotePurgedEvent";
import { handleNoteTrashedEvent as publicationHandleNoteTrashedEvent } from "../../publication/handleNoteTrashedEvent";
import { handleUserDeletedEvent as publicationHandleUserDeletedEvent } from "../../publication/handleUserDeletedEvent";
import { buildNoteSnapshots } from "../../search/buildNoteSnapshot";
import { handleNoteSavedEvent } from "../../search/handleNoteSavedEvent";
import { handleNoteTrashedEvent as searchHandleNoteTrashedEvent } from "../../search/handleNoteTrashedEvent";
import { handlePublicationChangedEvent } from "../../search/handlePublicationChangedEvent";
import { handleDirectoryDeletedEvent as viewHandleDirectoryDeletedEvent } from "../../view/handleDirectoryDeletedEvent";
import { handleNotePurgedEvent as viewHandleNotePurgedEvent } from "../../view/handleNotePurgedEvent";
import { handleTagDeletedEvent as viewHandleTagDeletedEvent } from "../../view/handleTagDeletedEvent";
import { dispatchDomainEvent } from "../dispatchDomainEvent";

vi.mock("../../ingestion/runIngestionJob", () => ({
  runIngestionJob: vi.fn(async () => undefined),
}));
vi.mock("../../export/runExportJob", () => ({
  runExportJob: vi.fn(async () => ({ job: null })),
}));
vi.mock("../../search/handleNoteSavedEvent", () => ({
  handleNoteSavedEvent: vi.fn(async () => undefined),
}));
vi.mock("../../search/handleNoteTrashedEvent", () => ({
  handleNoteTrashedEvent: vi.fn(async () => undefined),
}));
vi.mock("../../search/handlePublicationChangedEvent", () => ({
  handlePublicationChangedEvent: vi.fn(async () => undefined),
}));
vi.mock("../../publication/handleNoteTrashedEvent", () => ({
  handleNoteTrashedEvent: vi.fn(async () => undefined),
}));
vi.mock("../../publication/handleNotePurgedEvent", () => ({
  handleNotePurgedEvent: vi.fn(async () => undefined),
}));
vi.mock("../../media/handleNotePurgedEvent", () => ({
  handleNotePurgedEvent: vi.fn(async () => undefined),
}));
vi.mock("../../view/handleNotePurgedEvent", () => ({
  handleNotePurgedEvent: vi.fn(async () => undefined),
}));
vi.mock("../../view/handleTagDeletedEvent", () => ({
  handleTagDeletedEvent: vi.fn(async () => undefined),
}));
vi.mock("../../view/handleDirectoryDeletedEvent", () => ({
  handleDirectoryDeletedEvent: vi.fn(async () => undefined),
}));
vi.mock("../../publication/handleUserDeletedEvent", () => ({
  handleUserDeletedEvent: vi.fn(async () => undefined),
}));
vi.mock("../../export/handleUserDeletedEvent", () => ({
  handleUserDeletedEvent: vi.fn(async () => ({ cancelled: 0 })),
}));
vi.mock("../../search/buildNoteSnapshot", () => ({
  buildNoteSnapshots: vi.fn(async () => []),
}));
vi.mock("../../note/handleLinkTargetResolution", () => ({
  handleLinkTargetResolution: vi.fn(async () => undefined),
}));
vi.mock("../../note/handleLinkTargetTrashed", () => ({
  handleLinkTargetTrashed: vi.fn(async () => undefined),
}));

const mockedRunIngestionJob = vi.mocked(runIngestionJob);
const mockedRunExportJob = vi.mocked(runExportJob);
const mockedHandleNoteSavedEvent = vi.mocked(handleNoteSavedEvent);
const mockedSearchHandleNoteTrashed = vi.mocked(searchHandleNoteTrashedEvent);
const mockedHandlePublicationChanged = vi.mocked(handlePublicationChangedEvent);
const mockedPublicationHandleNoteTrashed = vi.mocked(
  publicationHandleNoteTrashedEvent,
);
const mockedPublicationHandleNotePurged = vi.mocked(
  publicationHandleNotePurgedEvent,
);
const mockedMediaHandleNotePurged = vi.mocked(mediaHandleNotePurgedEvent);
const mockedHandleLinkTargetResolution = vi.mocked(handleLinkTargetResolution);
const mockedHandleLinkTargetTrashed = vi.mocked(handleLinkTargetTrashed);
const mockedViewHandleNotePurged = vi.mocked(viewHandleNotePurgedEvent);
const mockedViewHandleTagDeleted = vi.mocked(viewHandleTagDeletedEvent);
const mockedViewHandleDirectoryDeleted = vi.mocked(
  viewHandleDirectoryDeletedEvent,
);
const mockedPublicationHandleUserDeleted = vi.mocked(
  publicationHandleUserDeletedEvent,
);
const mockedExportHandleUserDeleted = vi.mocked(exportHandleUserDeletedEvent);
const mockedBuildNoteSnapshots = vi.mocked(buildNoteSnapshots);

const stubLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Fake note returned by `noteRepository.findById`. The dispatcher only
// reads `status` and forwards the entity to `buildNoteSnapshots`, which
// is mocked — so a minimal partial cast suffices.
function fakeActiveNote(noteId: string): Note {
  return {
    id: noteId as NoteId,
    status: "active" as const,
    trashedAt: null,
    title: "fake" as NoteTitle,
  } as unknown as Note;
}

function fakeTrashedNote(noteId: string): Note {
  return {
    id: noteId as NoteId,
    status: "trashed" as const,
    trashedAt: new Date(0),
    title: "fake" as NoteTitle,
  } as unknown as Note;
}

// Sentinel snapshot used to assert the dispatcher forwards the
// `buildNoteSnapshots` output verbatim into the search handler.
function fakeSnapshot(noteId: string): NoteSnapshot {
  return {
    noteId: noteId as NoteId,
    ownerId: OWNER_ID,
    visibility: "public",
    title: "fake",
    plainBody: "",
    tagNames: [],
    directoryPath: "/",
    frontMatterDate: null,
    updatedAt: new Date(0),
  };
}

type FindByIdResult = { entity: Note; expectedVersion: never } | null;

function makeStubContainer(opts: { findByIdResult?: FindByIdResult }): {
  container: ConsumerContainer;
  uowFindById: ReturnType<typeof vi.fn>;
  clockNow: ReturnType<typeof vi.fn>;
} {
  const uowFindById = vi.fn(async () =>
    opts.findByIdResult === undefined ? null : opts.findByIdResult,
  );
  // Issue #595: the activity-log fan-out for ingestion.created /
  // ingestion.failed / export.job.completed / user.created opens a
  // read-only UoW to resolve owner / file metadata. The stub returns `null`
  // from those repositories (job/user absent), which the handlers tolerate
  // (they fall back to the raw id and still write/skip), so the dispatch
  // routing assertions stay focused on `runIngestionJob` etc.
  const absentFindById = vi.fn(async () => null);
  const unitOfWorkProvider = {
    run: async <T>(
      fn: (ctx: {
        noteRepository: { findById: typeof uowFindById };
        directoryRepository: object;
        tagRepository: object;
        publicationStateRepository: object;
        ingestionJobRepository: { findById: typeof absentFindById };
        exportJobRepository: { findById: typeof absentFindById };
        userRepository: { findById: typeof absentFindById };
      }) => Promise<T>,
    ): Promise<T> =>
      fn({
        noteRepository: { findById: uowFindById },
        directoryRepository: {},
        tagRepository: {},
        publicationStateRepository: {},
        ingestionJobRepository: { findById: absentFindById },
        exportJobRepository: { findById: absentFindById },
        userRepository: { findById: absentFindById },
      }),
  };
  // Monotonic fake clock: each `now()` advances 1s so the `user.deleted`
  // fan-out duration (`end - start`) is a positive, deterministic value.
  // Only the `user.deleted` case reads `clock`, so this is inert for the
  // other dispatch branches. Exposed as a spy so a test can assert the
  // measured span is bounded by exactly two `now()` reads.
  let clockTick = 0;
  const clockNow = vi.fn(() => {
    clockTick += 1000;
    return new Date(clockTick);
  });
  const container = {
    logger: stubLogger,
    clock: { now: clockNow },
    htmlSanitizer: {
      sanitize: vi.fn(),
      toPlainText: vi.fn(),
    },
    unitOfWorkProvider,
    // Issue #595: activity-log projection target for the fan-out cases.
    idGenerator: {
      next: () => "ffffffff-ffff-7fff-8fff-000000000001",
      validate: () => true,
    },
    activityLogRepository: {
      insertIfAbsent: vi.fn(async () => {}),
      recordBurst: vi.fn(async () => {}),
      findRecent: vi.fn(async () => []),
      pruneOlderThan: vi.fn(async () => ({ deleted: 0 })),
      pruneBurstOlderThan: vi.fn(async () => ({ deleted: 0 })),
    },
  } as unknown as ConsumerContainer;
  return { container, uowFindById, clockNow };
}

const EVENT_ID = "01938f00-0000-7000-8000-aaaaaaaaaaaa" as EventId;
const INGESTION_JOB_ID = "01938f00-0001-7000-8000-aaaaaaaaaaaa";
const EXPORT_JOB_ID = "01938f00-0002-7000-8000-aaaaaaaaaaaa";
const NOTE_ID = "01938f00-0003-7000-8000-aaaaaaaaaaaa" as NoteId;
const OWNER_ID = "01938f00-0004-7000-8000-aaaaaaaaaaaa" as UserId;

function ingestionCreatedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "ingestion.created",
    payload: {
      jobId: INGESTION_JOB_ID as unknown as IngestionJobIdBrand,
      kind: "plain" as SourceFileKind,
    },
    occurredAt: new Date(0),
    aggregateId: INGESTION_JOB_ID,
  };
}

function ingestionRetryRequestedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "ingestion.retryRequested",
    payload: { jobId: INGESTION_JOB_ID as unknown as IngestionJobIdBrand },
    occurredAt: new Date(0),
    aggregateId: INGESTION_JOB_ID,
  };
}

function ingestionRegeneratedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "ingestion.regenerated",
    payload: {
      jobId: INGESTION_JOB_ID as unknown as IngestionJobIdBrand,
      regenerationCount: 1,
    },
    occurredAt: new Date(0),
    aggregateId: INGESTION_JOB_ID,
  };
}

function ingestionPreviewAttachedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "ingestion.previewAttached",
    payload: { jobId: INGESTION_JOB_ID as unknown as IngestionJobIdBrand },
    occurredAt: new Date(0),
    aggregateId: INGESTION_JOB_ID,
  };
}

function exportRequestedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "export.job.requested",
    payload: {
      exportJobId: EXPORT_JOB_ID as unknown as ExportJobId,
      ownerId: OWNER_ID,
      format: "html",
      scope: "single",
    },
    occurredAt: new Date(0),
    aggregateId: EXPORT_JOB_ID,
  };
}

function exportRetryRequestedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "export.job.retryRequested",
    payload: { exportJobId: EXPORT_JOB_ID as unknown as ExportJobId },
    occurredAt: new Date(0),
    aggregateId: EXPORT_JOB_ID,
  };
}

function noteCreatedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "note.created",
    payload: {
      noteId: NOTE_ID,
      ownerId: OWNER_ID,
      directoryId: "01938f00-dddd-7000-8000-000000000001",
      slug: "slug",
      title: "title",
      tagIds: [] as readonly TagId[],
      mediaRefs: [] as readonly MediaAssetId[],
    },
    occurredAt: new Date(0),
    aggregateId: NOTE_ID,
  };
}

function noteContentUpdatedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "note.content_updated",
    payload: {
      noteId: NOTE_ID,
      ownerId: OWNER_ID,
      title: "title",
      tagIds: [] as readonly TagId[],
      mediaRefs: [] as readonly MediaAssetId[],
    },
    occurredAt: new Date(0),
    aggregateId: NOTE_ID,
  };
}

function noteRenamedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "note.renamed",
    payload: {
      noteId: NOTE_ID,
      ownerId: OWNER_ID,
      title: "title",
      slug: "slug",
    },
    occurredAt: new Date(0),
    aggregateId: NOTE_ID,
  };
}

function noteMovedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "note.moved",
    payload: {
      noteId: NOTE_ID,
      ownerId: OWNER_ID,
      fromDirectoryId: "01938f00-dddd-7000-8000-000000000001",
      toDirectoryId: "01938f00-dddd-7000-8000-000000000002",
    },
    occurredAt: new Date(0),
    aggregateId: NOTE_ID,
  };
}

function noteRestoredEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "note.restored",
    payload: {
      noteId: NOTE_ID,
      ownerId: OWNER_ID,
      directoryId: "01938f00-dddd-7000-8000-000000000001",
    },
    occurredAt: new Date(0),
    aggregateId: NOTE_ID,
  };
}

function noteTagsReplacedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "note.tags_replaced",
    payload: {
      noteId: NOTE_ID,
      ownerId: OWNER_ID,
      previousTagIds: [] as readonly TagId[],
      tagIds: [] as readonly TagId[],
    },
    occurredAt: new Date(0),
    aggregateId: NOTE_ID,
  };
}

function noteTrashedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "note.trashed",
    payload: {
      noteId: NOTE_ID,
      ownerId: OWNER_ID,
      mediaRefs: [] as readonly MediaAssetId[],
    },
    occurredAt: new Date(0),
    aggregateId: NOTE_ID,
  };
}

function notePurgedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "note.purged",
    payload: {
      noteId: NOTE_ID,
      ownerId: OWNER_ID,
      mediaRefs: [] as readonly MediaAssetId[],
    },
    occurredAt: new Date(0),
    aggregateId: NOTE_ID,
  };
}

function notePublishChangedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "note.publish_changed",
    payload: {
      noteId: NOTE_ID,
      ownerId: OWNER_ID,
      previous: "private" as PublicationVisibility,
      next: "public" as PublicationVisibility,
    },
    occurredAt: new Date(0),
    aggregateId: NOTE_ID,
  };
}

function shareLinkIssuedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "share_link.issued",
    payload: {
      shareLinkId: "01938f00-eeee-7000-8000-000000000001" as ShareLinkId,
      noteId: NOTE_ID,
      ownerId: OWNER_ID,
    },
    occurredAt: new Date(0),
    aggregateId: NOTE_ID,
  };
}

function shareLinkRevokedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "share_link.revoked",
    payload: {
      shareLinkId: "01938f00-eeee-7000-8000-000000000001" as ShareLinkId,
      noteId: NOTE_ID,
      ownerId: OWNER_ID,
    },
    occurredAt: new Date(0),
    aggregateId: NOTE_ID,
  };
}

const TAG_ID = "01938f00-fff0-7000-8000-000000000001" as TagId;

function tagDeletedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "tag.deleted",
    payload: { tagId: TAG_ID },
    occurredAt: new Date(0),
    aggregateId: TAG_ID,
  };
}

const DIRECTORY_ID = "01938f00-fff1-7000-8000-000000000001";

// `directory.deleted` is now a physical event (Issue #181), so the
// `AllDomainEvents` union covers its `type` and no `as never` cast is
// needed here.
function directoryDeletedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "directory.deleted",
    payload: { directoryId: DIRECTORY_ID },
    occurredAt: new Date(0),
    aggregateId: DIRECTORY_ID,
  };
}

// `media.uploaded` is a physical event that is NEVER emitted by the
// production code (Issue #159 ADR-003: Media's orphan monitoring is
// TTL-based rather than event-driven). It remains an `as never` fake
// event so the skipped-regression-guard test can still exercise the
// default branch of the dispatcher switch.
function mediaUploadedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "media.uploaded" as never,
    payload: {
      mediaId: "01938f00-fff2-7000-8000-000000000001",
    } as never,
    occurredAt: new Date(0),
    aggregateId: "01938f00-fff2-7000-8000-000000000001",
  } as DomainEvent;
}

function userDeletedEvent(): DomainEvent {
  return {
    id: EVENT_ID,
    type: "user.deleted",
    payload: { userId: OWNER_ID, deletedAt: new Date(0) },
    occurredAt: new Date(0),
    aggregateId: OWNER_ID,
  };
}

beforeEach(() => {
  mockedRunIngestionJob.mockReset();
  mockedRunExportJob.mockReset();
  mockedHandleNoteSavedEvent.mockReset();
  mockedSearchHandleNoteTrashed.mockReset();
  mockedHandlePublicationChanged.mockReset();
  mockedPublicationHandleNoteTrashed.mockReset();
  mockedPublicationHandleNotePurged.mockReset();
  mockedMediaHandleNotePurged.mockReset();
  mockedViewHandleNotePurged.mockReset();
  mockedViewHandleTagDeleted.mockReset();
  mockedViewHandleDirectoryDeleted.mockReset();
  mockedPublicationHandleUserDeleted.mockReset();
  mockedExportHandleUserDeleted.mockReset();
  mockedBuildNoteSnapshots.mockReset();
  mockedHandleLinkTargetResolution.mockReset();
  mockedHandleLinkTargetTrashed.mockReset();

  mockedHandleLinkTargetResolution.mockResolvedValue(undefined);
  mockedHandleLinkTargetTrashed.mockResolvedValue(undefined);
  mockedRunIngestionJob.mockResolvedValue(undefined);
  mockedRunExportJob.mockResolvedValue({ job: null });
  mockedHandleNoteSavedEvent.mockResolvedValue(undefined);
  mockedSearchHandleNoteTrashed.mockResolvedValue(undefined);
  mockedHandlePublicationChanged.mockResolvedValue(undefined);
  mockedPublicationHandleNoteTrashed.mockResolvedValue(undefined);
  mockedPublicationHandleNotePurged.mockResolvedValue(undefined);
  mockedMediaHandleNotePurged.mockResolvedValue(undefined);
  mockedViewHandleNotePurged.mockResolvedValue(undefined);
  mockedViewHandleTagDeleted.mockResolvedValue(undefined);
  mockedViewHandleDirectoryDeleted.mockResolvedValue(undefined);
  mockedPublicationHandleUserDeleted.mockResolvedValue(undefined);
  mockedExportHandleUserDeleted.mockResolvedValue({ cancelled: 0 });
  // Default: snapshot builder returns a single sentinel snapshot. Tests
  // that care about the empty / multi-result case override per-test.
  mockedBuildNoteSnapshots.mockResolvedValue([fakeSnapshot(NOTE_ID)]);

  vi.mocked(stubLogger.info).mockClear();
  vi.mocked(stubLogger.warn).mockClear();
  vi.mocked(stubLogger.error).mockClear();
});

describe("dispatchDomainEvent — ingestion / export routing", () => {
  it("routes ingestion.created to runIngestionJob and returns handled", async () => {
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      ingestionCreatedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedRunIngestionJob).toHaveBeenCalledTimes(1);
    expect(mockedRunIngestionJob).toHaveBeenCalledWith({
      container,
      input: { jobId: INGESTION_JOB_ID },
    });
    expect(mockedRunExportJob).not.toHaveBeenCalled();
  });

  it("routes ingestion.retryRequested to runIngestionJob and returns handled", async () => {
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      ingestionRetryRequestedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedRunIngestionJob).toHaveBeenCalledWith({
      container,
      input: { jobId: INGESTION_JOB_ID },
    });
  });

  it("routes export.job.requested to runExportJob and returns handled", async () => {
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      exportRequestedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedRunExportJob).toHaveBeenCalledTimes(1);
    expect(mockedRunExportJob).toHaveBeenCalledWith({
      container,
      input: { jobId: EXPORT_JOB_ID as unknown as ExportJobId },
    });
    expect(mockedRunIngestionJob).not.toHaveBeenCalled();
  });

  it("routes export.job.retryRequested to runExportJob and returns handled", async () => {
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      exportRetryRequestedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedRunExportJob).toHaveBeenCalledWith({
      container,
      input: { jobId: EXPORT_JOB_ID as unknown as ExportJobId },
    });
  });

  it("routes ingestion.regenerated to runIngestionJob and returns handled (Issue #253 reverses ADR-004)", async () => {
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      ingestionRegeneratedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedRunIngestionJob).toHaveBeenCalledTimes(1);
    expect(mockedRunIngestionJob).toHaveBeenCalledWith({
      container,
      input: { jobId: INGESTION_JOB_ID },
    });
    expect(mockedRunExportJob).not.toHaveBeenCalled();
  });

  it("skips ingestion.previewAttached", async () => {
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      ingestionPreviewAttachedEvent(),
    );
    expect(outcome).toEqual({ kind: "skipped" });
    expect(mockedRunIngestionJob).not.toHaveBeenCalled();
  });
});

describe("dispatchDomainEvent — note save routing (#145)", () => {
  const saveEvents: ReadonlyArray<[string, () => DomainEvent]> = [
    ["note.created", noteCreatedEvent],
    ["note.content_updated", noteContentUpdatedEvent],
    ["note.renamed", noteRenamedEvent],
    ["note.moved", noteMovedEvent],
    ["note.restored", noteRestoredEvent],
    ["note.tags_replaced", noteTagsReplacedEvent],
  ];

  for (const [name, factory] of saveEvents) {
    it(`routes ${name} to handleNoteSavedEvent with the rebuilt snapshot`, async () => {
      const { container, uowFindById } = makeStubContainer({
        findByIdResult: {
          entity: fakeActiveNote(NOTE_ID),
          expectedVersion: 0 as never,
        },
      });
      const outcome = await dispatchDomainEvent(container, factory());
      expect(outcome).toEqual({ kind: "handled" });
      expect(uowFindById).toHaveBeenCalledTimes(1);
      expect(mockedBuildNoteSnapshots).toHaveBeenCalledTimes(1);
      expect(mockedHandleNoteSavedEvent).toHaveBeenCalledTimes(1);
      const callArg = mockedHandleNoteSavedEvent.mock.calls[0]?.[0];
      expect(callArg?.input.snapshot.noteId).toBe(NOTE_ID);
      // Issue #321: link re-resolution runs for the title/id-affecting
      // subset only; moved / tags_replaced leave title and id unchanged.
      const expectsResolution = [
        "note.created",
        "note.content_updated",
        "note.renamed",
        "note.restored",
      ].includes(name);
      expect(mockedHandleLinkTargetResolution).toHaveBeenCalledTimes(
        expectsResolution ? 1 : 0,
      );
    });
  }

  it("handles save event with skip when noteRepository returns null (purge race)", async () => {
    const { container } = makeStubContainer({
      findByIdResult: null,
    });
    const outcome = await dispatchDomainEvent(container, noteCreatedEvent());
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedHandleNoteSavedEvent).not.toHaveBeenCalled();
    expect(stubLogger.info).toHaveBeenCalledTimes(1);
    expect(vi.mocked(stubLogger.info).mock.calls[0]?.[0]).toContain(
      "note.created",
    );
  });

  it("handles save event with skip when note is trashed (ADR-007 trashed status guard)", async () => {
    const { container } = makeStubContainer({
      findByIdResult: {
        entity: fakeTrashedNote(NOTE_ID),
        expectedVersion: 0 as never,
      },
    });
    const outcome = await dispatchDomainEvent(container, noteRenamedEvent());
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedHandleNoteSavedEvent).not.toHaveBeenCalled();
    expect(mockedBuildNoteSnapshots).not.toHaveBeenCalled();
    expect(stubLogger.info).toHaveBeenCalledTimes(1);
  });

  it("handles save event with skip when buildNoteSnapshots returns empty", async () => {
    mockedBuildNoteSnapshots.mockResolvedValueOnce([]);
    const { container } = makeStubContainer({
      findByIdResult: {
        entity: fakeActiveNote(NOTE_ID),
        expectedVersion: 0 as never,
      },
    });
    const outcome = await dispatchDomainEvent(container, noteCreatedEvent());
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedHandleNoteSavedEvent).not.toHaveBeenCalled();
  });

  it("returns handled+warn when payload noteId is empty (BusinessRuleError)", async () => {
    const { container } = makeStubContainer({});
    const event: DomainEvent = {
      id: EVENT_ID,
      type: "note.created",
      payload: {
        noteId: "" as NoteId,
        ownerId: OWNER_ID,
        directoryId: "01938f00-dddd-7000-8000-000000000001",
        slug: "slug",
        title: "title",
        tagIds: [] as readonly TagId[],
        mediaRefs: [] as readonly MediaAssetId[],
      },
      occurredAt: new Date(0),
      aggregateId: NOTE_ID,
    };
    const outcome = await dispatchDomainEvent(container, event);
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedHandleNoteSavedEvent).not.toHaveBeenCalled();
    expect(stubLogger.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(stubLogger.warn).mock.calls[0]?.[0]).toContain(
      "note.created",
    );
  });

  it("returns retry when handleNoteSavedEvent throws a transient error", async () => {
    mockedHandleNoteSavedEvent.mockRejectedValueOnce(
      new Error("d1 connection refused"),
    );
    const { container } = makeStubContainer({
      findByIdResult: {
        entity: fakeActiveNote(NOTE_ID),
        expectedVersion: 0 as never,
      },
    });
    const outcome = await dispatchDomainEvent(container, noteCreatedEvent());
    expect(outcome.kind).toBe("retry");
  });
});

describe("dispatchDomainEvent — note.trashed fan-out (#145 + #159)", () => {
  it("calls search → publication → view → link-trashed handlers in order", async () => {
    const callOrder: string[] = [];
    mockedSearchHandleNoteTrashed.mockImplementationOnce(async () => {
      callOrder.push("search");
    });
    mockedPublicationHandleNoteTrashed.mockImplementationOnce(async () => {
      callOrder.push("publication");
    });
    mockedViewHandleNotePurged.mockImplementationOnce(async () => {
      callOrder.push("view");
    });
    mockedHandleLinkTargetTrashed.mockImplementationOnce(async () => {
      callOrder.push("link-trashed");
    });
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(container, noteTrashedEvent());
    expect(outcome).toEqual({ kind: "handled" });
    expect(callOrder).toEqual([
      "search",
      "publication",
      "view",
      "link-trashed",
    ]);
  });

  it("returns retry on fan-out partial failure (search ok, publication transient)", async () => {
    mockedSearchHandleNoteTrashed.mockResolvedValueOnce(undefined);
    mockedPublicationHandleNoteTrashed.mockRejectedValueOnce(
      new Error("d1 transient"),
    );
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(container, noteTrashedEvent());
    expect(outcome.kind).toBe("retry");
    expect(mockedSearchHandleNoteTrashed).toHaveBeenCalledTimes(1);
    expect(mockedPublicationHandleNoteTrashed).toHaveBeenCalledTimes(1);
    expect(mockedViewHandleNotePurged).not.toHaveBeenCalled();
  });

  it("returns retry when view handler fails after publication ok", async () => {
    mockedViewHandleNotePurged.mockRejectedValueOnce(new Error("d1 transient"));
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(container, noteTrashedEvent());
    expect(outcome.kind).toBe("retry");
    expect(mockedSearchHandleNoteTrashed).toHaveBeenCalledTimes(1);
    expect(mockedPublicationHandleNoteTrashed).toHaveBeenCalledTimes(1);
    expect(mockedViewHandleNotePurged).toHaveBeenCalledTimes(1);
  });

  it("returns handled+warn when payload noteId is empty (BusinessRuleError)", async () => {
    const { container } = makeStubContainer({});
    const event: DomainEvent = {
      id: EVENT_ID,
      type: "note.trashed",
      payload: {
        noteId: "" as NoteId,
        ownerId: OWNER_ID,
        mediaRefs: [] as readonly MediaAssetId[],
      },
      occurredAt: new Date(0),
      aggregateId: NOTE_ID,
    };
    const outcome = await dispatchDomainEvent(container, event);
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedSearchHandleNoteTrashed).not.toHaveBeenCalled();
    expect(mockedPublicationHandleNoteTrashed).not.toHaveBeenCalled();
    expect(mockedViewHandleNotePurged).not.toHaveBeenCalled();
    expect(stubLogger.warn).toHaveBeenCalledTimes(1);
  });
});

describe("dispatchDomainEvent — note.purged fan-out (#159)", () => {
  it("calls search → publication → media → view handlers in order", async () => {
    const callOrder: string[] = [];
    mockedSearchHandleNoteTrashed.mockImplementationOnce(async () => {
      callOrder.push("search");
    });
    mockedPublicationHandleNotePurged.mockImplementationOnce(async () => {
      callOrder.push("publication");
    });
    mockedMediaHandleNotePurged.mockImplementationOnce(async () => {
      callOrder.push("media");
    });
    mockedViewHandleNotePurged.mockImplementationOnce(async () => {
      callOrder.push("view");
    });
    const { container } = makeStubContainer({});
    const event = notePurgedEvent();
    const outcome = await dispatchDomainEvent(container, event);
    expect(outcome).toEqual({ kind: "handled" });
    expect(callOrder).toEqual(["search", "publication", "media", "view"]);
    // The media handler receives the full event envelope (per ADR-005).
    const mediaCallArg = mockedMediaHandleNotePurged.mock.calls[0]?.[0];
    expect(mediaCallArg?.input.event).toBe(event);
  });

  it("returns retry when media handler fails after publication ok (view not called)", async () => {
    mockedMediaHandleNotePurged.mockRejectedValueOnce(
      new Error("d1 transient"),
    );
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(container, notePurgedEvent());
    expect(outcome.kind).toBe("retry");
    expect(mockedSearchHandleNoteTrashed).toHaveBeenCalledTimes(1);
    expect(mockedPublicationHandleNotePurged).toHaveBeenCalledTimes(1);
    expect(mockedMediaHandleNotePurged).toHaveBeenCalledTimes(1);
    expect(mockedViewHandleNotePurged).not.toHaveBeenCalled();
  });

  it("returns retry when view handler fails after media ok", async () => {
    mockedViewHandleNotePurged.mockRejectedValueOnce(new Error("d1 transient"));
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(container, notePurgedEvent());
    expect(outcome.kind).toBe("retry");
    expect(mockedSearchHandleNoteTrashed).toHaveBeenCalledTimes(1);
    expect(mockedPublicationHandleNotePurged).toHaveBeenCalledTimes(1);
    expect(mockedMediaHandleNotePurged).toHaveBeenCalledTimes(1);
    expect(mockedViewHandleNotePurged).toHaveBeenCalledTimes(1);
  });

  it("returns retry when publication purge fails (media / view not called)", async () => {
    mockedPublicationHandleNotePurged.mockRejectedValueOnce(
      new Error("d1 transient"),
    );
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(container, notePurgedEvent());
    expect(outcome.kind).toBe("retry");
    expect(mockedMediaHandleNotePurged).not.toHaveBeenCalled();
    expect(mockedViewHandleNotePurged).not.toHaveBeenCalled();
  });

  it("returns handled+warn when payload noteId is empty (ADR-005: validation before any handler)", async () => {
    const { container } = makeStubContainer({});
    const event: DomainEvent = {
      id: EVENT_ID,
      type: "note.purged",
      payload: {
        noteId: "" as NoteId,
        ownerId: OWNER_ID,
        mediaRefs: [] as readonly MediaAssetId[],
      },
      occurredAt: new Date(0),
      aggregateId: NOTE_ID,
    };
    const outcome = await dispatchDomainEvent(container, event);
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedSearchHandleNoteTrashed).not.toHaveBeenCalled();
    expect(mockedPublicationHandleNotePurged).not.toHaveBeenCalled();
    expect(mockedMediaHandleNotePurged).not.toHaveBeenCalled();
    expect(mockedViewHandleNotePurged).not.toHaveBeenCalled();
    expect(stubLogger.warn).toHaveBeenCalledTimes(1);
  });

  it("returns handled+warn when payload ownerId is empty (ADR-005: head validation)", async () => {
    const { container } = makeStubContainer({});
    const event: DomainEvent = {
      id: EVENT_ID,
      type: "note.purged",
      payload: {
        noteId: NOTE_ID,
        ownerId: "" as UserId,
        mediaRefs: [] as readonly MediaAssetId[],
      },
      occurredAt: new Date(0),
      aggregateId: NOTE_ID,
    };
    const outcome = await dispatchDomainEvent(container, event);
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedSearchHandleNoteTrashed).not.toHaveBeenCalled();
    expect(stubLogger.warn).toHaveBeenCalledTimes(1);
  });

  it("returns handled+warn when payload mediaRefs contains an empty string (ADR-005: head validation)", async () => {
    const { container } = makeStubContainer({});
    const event: DomainEvent = {
      id: EVENT_ID,
      type: "note.purged",
      payload: {
        noteId: NOTE_ID,
        ownerId: OWNER_ID,
        mediaRefs: ["" as MediaAssetId] as readonly MediaAssetId[],
      },
      occurredAt: new Date(0),
      aggregateId: NOTE_ID,
    };
    const outcome = await dispatchDomainEvent(container, event);
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedSearchHandleNoteTrashed).not.toHaveBeenCalled();
    expect(stubLogger.warn).toHaveBeenCalledTimes(1);
  });
});

describe("dispatchDomainEvent — tag.deleted routing (#159)", () => {
  it("routes tag.deleted to view handler and returns handled", async () => {
    const { container } = makeStubContainer({});
    const event = tagDeletedEvent();
    const outcome = await dispatchDomainEvent(container, event);
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedViewHandleTagDeleted).toHaveBeenCalledTimes(1);
    expect(mockedViewHandleTagDeleted).toHaveBeenCalledWith({
      container,
      input: { tagId: TAG_ID, name: "" },
    });
  });

  it("returns handled+warn when payload tagId is empty (BusinessRuleError)", async () => {
    const { container } = makeStubContainer({});
    const event: DomainEvent = {
      id: EVENT_ID,
      type: "tag.deleted",
      payload: { tagId: "" as TagId },
      occurredAt: new Date(0),
      aggregateId: TAG_ID,
    };
    const outcome = await dispatchDomainEvent(container, event);
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedViewHandleTagDeleted).not.toHaveBeenCalled();
    expect(stubLogger.warn).toHaveBeenCalledTimes(1);
  });

  it("returns retry when view handler throws a transient error", async () => {
    mockedViewHandleTagDeleted.mockRejectedValueOnce(new Error("d1 transient"));
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(container, tagDeletedEvent());
    expect(outcome.kind).toBe("retry");
  });
});

describe("dispatchDomainEvent — directory.deleted routing (#181)", () => {
  it("routes directory.deleted to view handler and returns handled", async () => {
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      directoryDeletedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedViewHandleDirectoryDeleted).toHaveBeenCalledTimes(1);
    expect(mockedViewHandleDirectoryDeleted).toHaveBeenCalledWith({
      container,
      input: { directoryId: DIRECTORY_ID, name: "" },
    });
  });

  it("returns handled+warn when payload directoryId is empty (ADR-159-005 head validation)", async () => {
    const { container } = makeStubContainer({});
    const event: DomainEvent = {
      id: EVENT_ID,
      type: "directory.deleted",
      payload: { directoryId: "   " },
      occurredAt: new Date(0),
      aggregateId: DIRECTORY_ID,
    };
    const outcome = await dispatchDomainEvent(container, event);
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedViewHandleDirectoryDeleted).not.toHaveBeenCalled();
    expect(stubLogger.warn).toHaveBeenCalledTimes(1);
  });

  it("returns retry when view handler throws a transient error", async () => {
    mockedViewHandleDirectoryDeleted.mockRejectedValueOnce(
      new Error("d1 transient"),
    );
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      directoryDeletedEvent(),
    );
    expect(outcome.kind).toBe("retry");
  });
});

describe("dispatchDomainEvent — user.deleted routing (#159)", () => {
  it("routes user.deleted to publication then export in order", async () => {
    const callOrder: string[] = [];
    mockedPublicationHandleUserDeleted.mockImplementationOnce(async () => {
      callOrder.push("publication");
    });
    mockedExportHandleUserDeleted.mockImplementationOnce(async () => {
      callOrder.push("export");
      return { cancelled: 0 };
    });
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(container, userDeletedEvent());
    expect(outcome).toEqual({ kind: "handled" });
    expect(callOrder).toEqual(["publication", "export"]);
    expect(mockedPublicationHandleUserDeleted).toHaveBeenCalledWith({
      container,
      input: { userId: OWNER_ID },
    });
    expect(mockedExportHandleUserDeleted).toHaveBeenCalledWith({
      container,
      input: { userId: OWNER_ID },
    });
  });

  it("returns retry on partial failure (publication ok, export transient)", async () => {
    mockedExportHandleUserDeleted.mockRejectedValueOnce(
      new Error("d1 transient"),
    );
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(container, userDeletedEvent());
    expect(outcome.kind).toBe("retry");
    expect(mockedPublicationHandleUserDeleted).toHaveBeenCalledTimes(1);
    expect(mockedExportHandleUserDeleted).toHaveBeenCalledTimes(1);
  });

  it("returns retry when publication fails (export not called)", async () => {
    mockedPublicationHandleUserDeleted.mockRejectedValueOnce(
      new Error("d1 transient"),
    );
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(container, userDeletedEvent());
    expect(outcome.kind).toBe("retry");
    expect(mockedPublicationHandleUserDeleted).toHaveBeenCalledTimes(1);
    expect(mockedExportHandleUserDeleted).not.toHaveBeenCalled();
  });

  it("returns handled+warn when payload userId is empty (BusinessRuleError)", async () => {
    const { container } = makeStubContainer({});
    const event: DomainEvent = {
      id: EVENT_ID,
      type: "user.deleted",
      payload: { userId: "" as UserId, deletedAt: new Date(0) },
      occurredAt: new Date(0),
      aggregateId: OWNER_ID,
    };
    const outcome = await dispatchDomainEvent(container, event);
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedPublicationHandleUserDeleted).not.toHaveBeenCalled();
    expect(mockedExportHandleUserDeleted).not.toHaveBeenCalled();
    expect(stubLogger.warn).toHaveBeenCalledTimes(1);
  });

  it("logs fan-out duration with userId after both handlers complete (#182)", async () => {
    // Default mocks resolve immediately (publication → undefined, export →
    // { cancelled: 0 }), i.e. an empty footprint (no public notes, no
    // in-flight jobs) — the log must still fire in that case.
    const { container, clockNow } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(container, userDeletedEvent());
    expect(outcome).toEqual({ kind: "handled" });
    expect(stubLogger.info).toHaveBeenCalledWith(
      "[dispatch] user.deleted fan-out complete",
      expect.objectContaining({
        eventId: EVENT_ID,
        userId: OWNER_ID,
        durationMs: expect.any(Number),
      }),
    );
    const meta = vi
      .mocked(stubLogger.info)
      .mock.calls.find(
        ([msg]) => msg === "[dispatch] user.deleted fan-out complete",
      )?.[1] as { durationMs: number };
    // The advancing fake clock makes the span strictly positive (proving
    // the duration spans the fan-out, not a single timestamp) and bounded
    // by exactly two reads — start before publication, end after export —
    // guarding against a stray `now()` skewing the metric.
    expect(meta.durationMs).toBeGreaterThan(0);
    expect(clockNow).toHaveBeenCalledTimes(2);
  });
});

describe("dispatchDomainEvent — note.publish_changed routing (#145)", () => {
  it("routes to handlePublicationChangedEvent with the rebuilt snapshot", async () => {
    const { container, uowFindById } = makeStubContainer({
      findByIdResult: {
        entity: fakeActiveNote(NOTE_ID),
        expectedVersion: 0 as never,
      },
    });
    const outcome = await dispatchDomainEvent(
      container,
      notePublishChangedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
    expect(uowFindById).toHaveBeenCalledTimes(1);
    expect(mockedHandlePublicationChanged).toHaveBeenCalledTimes(1);
  });

  it("handles publish_changed with skip when note is trashed (ADR-007 trashed status guard E2E)", async () => {
    const { container } = makeStubContainer({
      findByIdResult: {
        entity: fakeTrashedNote(NOTE_ID),
        expectedVersion: 0 as never,
      },
    });
    const outcome = await dispatchDomainEvent(
      container,
      notePublishChangedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedHandlePublicationChanged).not.toHaveBeenCalled();
    expect(stubLogger.info).toHaveBeenCalledTimes(1);
  });

  it("handles publish_changed with skip when note is absent (purge race)", async () => {
    const { container } = makeStubContainer({
      findByIdResult: null,
    });
    const outcome = await dispatchDomainEvent(
      container,
      notePublishChangedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedHandlePublicationChanged).not.toHaveBeenCalled();
  });
});

describe("dispatchDomainEvent — skipped regression guards", () => {
  it("skips share_link.issued (intentional — separate routing discussion, out of scope for #159)", async () => {
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      shareLinkIssuedEvent(),
    );
    expect(outcome).toEqual({ kind: "skipped" });
  });

  it("skips share_link.revoked (intentional — separate routing discussion, out of scope for #159)", async () => {
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      shareLinkRevokedEvent(),
    );
    expect(outcome).toEqual({ kind: "skipped" });
  });

  it("skips media.uploaded (physical event never emitted — Issue #159 ADR-003)", async () => {
    // Media orphan monitoring is TTL-based (cron scans refCount=0 rows)
    // rather than event-driven; `media.uploaded` is not part of the
    // production event taxonomy.
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(container, mediaUploadedEvent());
    expect(outcome).toEqual({ kind: "skipped" });
  });
});

describe("dispatchDomainEvent — error classification", () => {
  it("returns retry when runIngestionJob throws LLMRateLimitError", async () => {
    const error = new LLMRateLimitError("rate limited");
    mockedRunIngestionJob.mockRejectedValueOnce(error);
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      ingestionCreatedEvent(),
    );
    expect(outcome).toEqual({ kind: "retry", error });
  });

  it("returns handled when runIngestionJob throws NotFoundError (job row gone)", async () => {
    mockedRunIngestionJob.mockRejectedValueOnce(
      new NotFoundError("INGESTION_JOB_NOT_FOUND", "missing"),
    );
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      ingestionCreatedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
  });

  it("returns retry when runIngestionJob throws a generic Error (D1 / transient)", async () => {
    const error = new Error("d1 connection refused");
    mockedRunIngestionJob.mockRejectedValueOnce(error);
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      ingestionCreatedEvent(),
    );
    expect(outcome).toEqual({ kind: "retry", error });
  });

  it("returns handled when runExportJob throws NotFoundError (job row gone)", async () => {
    mockedRunExportJob.mockRejectedValueOnce(
      new NotFoundError("EXPORT_JOB_NOT_FOUND", "missing"),
    );
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      exportRequestedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
  });

  it("returns retry when runExportJob throws a generic Error", async () => {
    const error = new Error("uow commit failed");
    mockedRunExportJob.mockRejectedValueOnce(error);
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      exportRetryRequestedEvent(),
    );
    expect(outcome).toEqual({ kind: "retry", error });
  });

  it("returns retry when runExportJob throws LLMRateLimitError (symmetric with ingestion)", async () => {
    const error = new LLMRateLimitError("rate limited");
    mockedRunExportJob.mockRejectedValueOnce(error);
    const { container } = makeStubContainer({});
    const outcome = await dispatchDomainEvent(
      container,
      exportRequestedEvent(),
    );
    expect(outcome).toEqual({ kind: "retry", error });
  });

  it("returns handled and logs.warn when payload jobId is an empty string (BusinessRuleError from VO factory)", async () => {
    // payload schema drift: relay published an event with an empty
    // jobId. The VO factory throws BusinessRuleError before runIngestionJob
    // is even called.
    const { container } = makeStubContainer({});
    const event: DomainEvent = {
      id: EVENT_ID,
      type: "ingestion.created",
      payload: {
        jobId: "" as unknown as IngestionJobIdBrand,
        kind: "plain" as SourceFileKind,
      },
      occurredAt: new Date(0),
      aggregateId: INGESTION_JOB_ID,
    };
    const outcome = await dispatchDomainEvent(container, event);
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedRunIngestionJob).not.toHaveBeenCalled();
    expect(stubLogger.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(stubLogger.warn).mock.calls[0]?.[0]).toContain(
      "ingestion.created",
    );
  });

  it("returns handled when export payload exportJobId is empty (BusinessRuleError)", async () => {
    const { container } = makeStubContainer({});
    const event: DomainEvent = {
      id: EVENT_ID,
      type: "export.job.requested",
      payload: {
        exportJobId: "" as unknown as ExportJobId,
        ownerId: OWNER_ID,
        format: "html",
        scope: "single",
      },
      occurredAt: new Date(0),
      aggregateId: EXPORT_JOB_ID,
    };
    const outcome = await dispatchDomainEvent(container, event);
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedRunExportJob).not.toHaveBeenCalled();
    expect(stubLogger.warn).toHaveBeenCalledTimes(1);
  });
});
