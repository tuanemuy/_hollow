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
import type { NoteId } from "@/core/domain/note/valueObject";
import type { RequestContainer } from "../../di/types";
import type { IngestionJobId as IngestionJobIdDTO } from "../../dto/ingestion";
import { NotFoundError } from "../../errors";
import { runExportJob } from "../../export/runExportJob";
import { runIngestionJob } from "../../ingestion/runIngestionJob";
import type { Logger } from "../../ports/logger";
import { dispatchDomainEvent } from "../dispatchDomainEvent";

vi.mock("../../ingestion/runIngestionJob", () => ({
  runIngestionJob: vi.fn(async () => undefined),
}));
vi.mock("../../export/runExportJob", () => ({
  runExportJob: vi.fn(async () => ({ job: null })),
}));

const mockedRunIngestionJob = vi.mocked(runIngestionJob);
const mockedRunExportJob = vi.mocked(runExportJob);

const stubLogger: Logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

// Container穴埋め: mocked usecases never read it; only the BusinessRuleError
// branch reads container.logger, hence the stub above.
const STUB_CONTAINER = { logger: stubLogger } as unknown as RequestContainer;

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

beforeEach(() => {
  mockedRunIngestionJob.mockReset();
  mockedRunExportJob.mockReset();
  mockedRunIngestionJob.mockResolvedValue(undefined);
  mockedRunExportJob.mockResolvedValue({ job: null });
  vi.mocked(stubLogger.warn).mockClear();
});

describe("dispatchDomainEvent — routing", () => {
  it("routes ingestion.created to runIngestionJob and returns handled", async () => {
    const outcome = await dispatchDomainEvent(
      STUB_CONTAINER,
      ingestionCreatedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedRunIngestionJob).toHaveBeenCalledTimes(1);
    expect(mockedRunIngestionJob).toHaveBeenCalledWith({
      container: STUB_CONTAINER,
      input: { jobId: INGESTION_JOB_ID as unknown as IngestionJobIdDTO },
    });
    expect(mockedRunExportJob).not.toHaveBeenCalled();
  });

  it("routes ingestion.retryRequested to runIngestionJob and returns handled", async () => {
    const outcome = await dispatchDomainEvent(
      STUB_CONTAINER,
      ingestionRetryRequestedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedRunIngestionJob).toHaveBeenCalledWith({
      container: STUB_CONTAINER,
      input: { jobId: INGESTION_JOB_ID as unknown as IngestionJobIdDTO },
    });
  });

  it("routes export.job.requested to runExportJob and returns handled", async () => {
    const outcome = await dispatchDomainEvent(
      STUB_CONTAINER,
      exportRequestedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedRunExportJob).toHaveBeenCalledTimes(1);
    expect(mockedRunExportJob).toHaveBeenCalledWith({
      container: STUB_CONTAINER,
      input: { jobId: EXPORT_JOB_ID as unknown as ExportJobId },
    });
    expect(mockedRunIngestionJob).not.toHaveBeenCalled();
  });

  it("routes export.job.retryRequested to runExportJob and returns handled", async () => {
    const outcome = await dispatchDomainEvent(
      STUB_CONTAINER,
      exportRetryRequestedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedRunExportJob).toHaveBeenCalledWith({
      container: STUB_CONTAINER,
      input: { jobId: EXPORT_JOB_ID as unknown as ExportJobId },
    });
  });

  it("skips ingestion.regenerated (regression guard: not in dispatch table per ADR-004)", async () => {
    const outcome = await dispatchDomainEvent(
      STUB_CONTAINER,
      ingestionRegeneratedEvent(),
    );
    expect(outcome).toEqual({ kind: "skipped" });
    expect(mockedRunIngestionJob).not.toHaveBeenCalled();
    expect(mockedRunExportJob).not.toHaveBeenCalled();
  });

  it("skips ingestion.previewAttached", async () => {
    const outcome = await dispatchDomainEvent(
      STUB_CONTAINER,
      ingestionPreviewAttachedEvent(),
    );
    expect(outcome).toEqual({ kind: "skipped" });
    expect(mockedRunIngestionJob).not.toHaveBeenCalled();
  });

  it("skips note.trashed", async () => {
    const outcome = await dispatchDomainEvent(
      STUB_CONTAINER,
      noteTrashedEvent(),
    );
    expect(outcome).toEqual({ kind: "skipped" });
    expect(mockedRunIngestionJob).not.toHaveBeenCalled();
    expect(mockedRunExportJob).not.toHaveBeenCalled();
  });
});

describe("dispatchDomainEvent — error classification", () => {
  it("returns retry when runIngestionJob throws LLMRateLimitError", async () => {
    const error = new LLMRateLimitError("rate limited");
    mockedRunIngestionJob.mockRejectedValueOnce(error);
    const outcome = await dispatchDomainEvent(
      STUB_CONTAINER,
      ingestionCreatedEvent(),
    );
    expect(outcome).toEqual({ kind: "retry", error });
  });

  it("returns handled when runIngestionJob throws NotFoundError (job row gone)", async () => {
    mockedRunIngestionJob.mockRejectedValueOnce(
      new NotFoundError("INGESTION_JOB_NOT_FOUND", "missing"),
    );
    const outcome = await dispatchDomainEvent(
      STUB_CONTAINER,
      ingestionCreatedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
  });

  it("returns retry when runIngestionJob throws a generic Error (D1 / transient)", async () => {
    const error = new Error("d1 connection refused");
    mockedRunIngestionJob.mockRejectedValueOnce(error);
    const outcome = await dispatchDomainEvent(
      STUB_CONTAINER,
      ingestionCreatedEvent(),
    );
    expect(outcome).toEqual({ kind: "retry", error });
  });

  it("returns handled when runExportJob throws NotFoundError (job row gone)", async () => {
    mockedRunExportJob.mockRejectedValueOnce(
      new NotFoundError("EXPORT_JOB_NOT_FOUND", "missing"),
    );
    const outcome = await dispatchDomainEvent(
      STUB_CONTAINER,
      exportRequestedEvent(),
    );
    expect(outcome).toEqual({ kind: "handled" });
  });

  it("returns retry when runExportJob throws a generic Error", async () => {
    const error = new Error("uow commit failed");
    mockedRunExportJob.mockRejectedValueOnce(error);
    const outcome = await dispatchDomainEvent(
      STUB_CONTAINER,
      exportRetryRequestedEvent(),
    );
    expect(outcome).toEqual({ kind: "retry", error });
  });

  it("returns retry when runExportJob throws LLMRateLimitError (symmetric with ingestion)", async () => {
    const error = new LLMRateLimitError("rate limited");
    mockedRunExportJob.mockRejectedValueOnce(error);
    const outcome = await dispatchDomainEvent(
      STUB_CONTAINER,
      exportRequestedEvent(),
    );
    expect(outcome).toEqual({ kind: "retry", error });
  });

  it("returns handled and logs.warn when payload jobId is an empty string (BusinessRuleError from VO factory)", async () => {
    // payload schema drift: relay published an event with an empty
    // jobId. The VO factory throws BusinessRuleError before runIngestionJob
    // is even called.
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
    const outcome = await dispatchDomainEvent(STUB_CONTAINER, event);
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedRunIngestionJob).not.toHaveBeenCalled();
    expect(stubLogger.warn).toHaveBeenCalledTimes(1);
    expect(vi.mocked(stubLogger.warn).mock.calls[0]?.[0]).toContain(
      "ingestion.created",
    );
  });

  it("returns handled when export payload exportJobId is empty (BusinessRuleError)", async () => {
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
    const outcome = await dispatchDomainEvent(STUB_CONTAINER, event);
    expect(outcome).toEqual({ kind: "handled" });
    expect(mockedRunExportJob).not.toHaveBeenCalled();
    expect(stubLogger.warn).toHaveBeenCalledTimes(1);
  });
});
