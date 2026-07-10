import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  isForbiddenError,
  isNotFoundError,
  isSystemError,
  SystemErrorCode,
} from "@/core/application/errors";
import { DirectoryErrorCode } from "@/core/domain/directory/errorCode";
import { isBusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import {
  type ObjectStorage,
  StorageUnavailableError,
} from "@/core/domain/media/ports/objectStorage";
import type { NoteId as DomainNoteId } from "@/core/domain/note/valueObject";
import {
  setupTestContainer,
  type TestContainer,
} from "../../__tests__/helpers";
import { purgeOrphans } from "../../media/purgeOrphans";
import { sweepAbandonedSourceIntakes } from "../../media/sweepAbandonedSourceIntakes";
import { bulkUpload } from "../bulkUpload";
import { commitIngestionPreview } from "../commitIngestionPreview";
import { discardIngestionPreview } from "../discardIngestionPreview";
import { getIngestionJob } from "../getIngestionJob";
import { getIngestionJobs } from "../getIngestionJobs";
import { regenerateIngestionPreview } from "../regenerateIngestionPreview";
import { uploadFile } from "../uploadFile";

const baseTime = new Date("2026-01-01T00:00:00.000Z");
const iso = (ms: number) => new Date(baseTime.getTime() + ms).toISOString();

let userSeq = 0;
function nextUserSuffix(): string {
  userSeq += 1;
  return userSeq.toString(16).padStart(12, "0");
}

let dirSeq = 0;
function nextDirId(): string {
  dirSeq += 1;
  return `019dd000-0000-7000-8000-${dirSeq.toString(16).padStart(12, "0")}`;
}

let jobSeq = 0;
function nextJobId(): string {
  jobSeq += 1;
  return `019df000-0000-7000-8000-${jobSeq.toString(16).padStart(12, "0")}`;
}

let noteSeq = 0;
function nextNoteId(): string {
  noteSeq += 1;
  return `019d0000-0000-7000-8000-${noteSeq.toString(16).padStart(12, "0")}`;
}

let mediaSeq = 0;
function nextMediaId(): string {
  mediaSeq += 1;
  return `019d3000-0000-7000-8000-${mediaSeq.toString(16).padStart(12, "0")}`;
}

let tagSeq = 0;
function nextTagId(): string {
  tagSeq += 1;
  return `019d4000-0000-7000-8000-${tagSeq.toString(16).padStart(12, "0")}`;
}

async function seedUser(container: TestContainer): Promise<string> {
  const suffix = nextUserSuffix();
  const id = `019d0001-0000-7000-8000-${suffix}`;
  await container.db.insert(schema.users).values({
    id,
    name: `user-${suffix}`,
    email: `user-${suffix}@example.test`,
    emailVerified: 1,
    username: `user_${suffix}`,
    role: "member",
    banned: 0,
    createdAt: iso(0),
    updatedAt: iso(0),
  });
  return id;
}

async function seedDirectory(
  container: TestContainer,
  ownerId: string,
): Promise<string> {
  const id = nextDirId();
  await container.db.insert(schema.directories).values({
    id,
    ownerId: ownerId,
    parentId: null,
    name: "root",
    slug: `root-${id.slice(-6)}`,
    depth: 0,
    version: 0,
    createdAt: iso(0),
    updatedAt: iso(0),
  });
  return id;
}

type SeedJobInput = {
  id?: string;
  ownerId: string;
  status:
    | "pending"
    | "processing"
    | "previewing"
    | "saved"
    | "failed"
    | "discarded";
  kind?: string;
  mimeType?: string;
  originalFileName?: string;
  byteSize?: number;
  tempStorageKey?: string | null;
  regenerationCount?: number;
  previewJson?: string | null;
  errorCode?: string | null;
  errorReason?: string | null;
  savedAsNoteId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

function defaultPreviewJson(): string {
  return JSON.stringify({
    title: "Preview Title",
    contentHtml: "<p>preview body</p>",
    suggestedDirectoryId: null,
    suggestedDirectoryName: null,
    frontMatter: {},
    suggestedTagNames: [],
    internalLinkRefs: [],
    mediaRefs: [],
  });
}

async function seedIngestionJob(
  container: TestContainer,
  input: SeedJobInput,
): Promise<string> {
  const id = input.id ?? nextJobId();
  const status = input.status;
  const previewJson =
    input.previewJson !== undefined
      ? input.previewJson
      : status === "previewing" || status === "saved"
        ? defaultPreviewJson()
        : null;
  await container.db.insert(schema.ingestionJobs).values({
    id,
    ownerId: input.ownerId,
    originalFileName: input.originalFileName ?? "doc.html",
    mimeType: input.mimeType ?? "text/html",
    byteSize: input.byteSize ?? 16,
    kind: input.kind ?? "html",
    status,
    tempStorageKey:
      input.tempStorageKey === undefined
        ? `${input.ownerId}/ingestion/${id}`
        : input.tempStorageKey,
    previewJson,
    errorCode: input.errorCode ?? null,
    errorReason: input.errorReason ?? null,
    regenerationCount: input.regenerationCount ?? 0,
    savedAsNoteId: input.savedAsNoteId ?? null,
    version: 0,
    createdAt: input.createdAt ?? iso(0),
    updatedAt: input.updatedAt ?? iso(0),
  });
  return id;
}

async function seedInstanceSettings(
  container: TestContainer,
  overrides: {
    maxIngestionBytes?: number;
    maxUploadBytesPerDay?: number;
    registrationOpen?: boolean;
  } = {},
): Promise<void> {
  const limits = {
    maxUploadBytesPerDay: overrides.maxUploadBytesPerDay ?? 1_073_741_824,
    maxIngestionBytes: overrides.maxIngestionBytes ?? 33_554_432,
    maxNoteBytes: 1_048_576,
    maxExportArtifactBytes: 268_435_456,
    maxShareLinksPerNote: 16,
    editLockTtlSec: 300,
    trashRetentionDays: 30,
  };
  await container.db.insert(schema.instanceSettings).values({
    id: "singleton",
    llmProvider: "anthropic",
    llmModel: "claude-3-5-sonnet",
    llmApiKeySource: "env",
    llmApiKeyCiphertext: null,
    promptsJson: "{}",
    designTokensJson: JSON.stringify({ tokens: {} }),
    registrationOpen: overrides.registrationOpen === false ? 0 : 1,
    registrationClosedReason: null,
    limitsJson: JSON.stringify(limits),
    version: 1,
    updatedAt: iso(0),
  });
}

/**
 * Test-local `ObjectStorage` whose `put` always raises
 * `StorageUnavailableError`, driving the commit stage (a) put-failure
 * path (same wrapper pattern as `purgeOrphans.integration.test.ts`'s
 * delete-throwing stub). Other methods delegate to the wrapped
 * in-memory storage so unrelated code paths still work.
 */
class PutThrowingObjectStorage implements ObjectStorage {
  constructor(private readonly inner: ObjectStorage) {}
  async put(): Promise<void> {
    throw new StorageUnavailableError("simulated R2 put failure");
  }
  get(key: string) {
    return this.inner.get(key);
  }
  stat(key: string) {
    return this.inner.stat(key);
  }
  delete(key: string) {
    return this.inner.delete(key);
  }
  presignDownload(key: string, ttlSec: number) {
    return this.inner.presignDownload(key, ttlSec);
  }
  presignUpload(key: string, contentType: string, ttlSec: number) {
    return this.inner.presignUpload(key, contentType, ttlSec);
  }
}

function makeStream(text: string): {
  bytes: ArrayBuffer;
  byteSize: number;
  stream: ReadableStream<Uint8Array>;
} {
  const encoded = new TextEncoder().encode(text);
  return {
    bytes: encoded.buffer.slice(
      encoded.byteOffset,
      encoded.byteOffset + encoded.byteLength,
    ) as ArrayBuffer,
    byteSize: encoded.byteLength,
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    }),
  };
}

function makeStreamOfSize(size: number): ReadableStream<Uint8Array> {
  // Build a deterministic zero-byte body without materialising a huge
  // string in memory; sufficient for size-cap probes that never need
  // to be parsed.
  const buf = new Uint8Array(size);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(buf);
      controller.close();
    },
  });
}

describe("uploadFile", () => {
  // spec: spec/testcases/ingestion/index.md#UploadFile
  const getContainer = setupTestContainer();

  it("creates a job row, stages bytes in temp storage, and emits ingestion.created for a supported format within size", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);

    const { stream, byteSize } = makeStream("<p>hello</p>");
    const { jobId } = await uploadFile({
      container,
      input: {
        actorUserId: owner,
        originalFileName: "hello.html",
        mimeType: "text/html",
        byteSize,
        bodyStream: stream,
      },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!row) throw new Error("unreachable");
    expect(row.status).toBe("pending");
    expect(row.kind).toBe("html");
    expect(row.ownerId).toBe(owner);
    expect(row.tempStorageKey).not.toBeNull();
    expect(row.byteSize).toBe(byteSize);

    // ADR-004 #4: spec says "Queue enqueue" but the implementation
    // publishes via outbox only — assert the outbox row instead.
    const events = await container.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.aggregateId, jobId));
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("ingestion.created");

    // Body must be staged in temp storage.
    const tempStorage = container.tempFileStorage as unknown as {
      has(key: string): boolean;
    };
    expect(tempStorage.has(row.tempStorageKey as string)).toBe(true);
  });

  it("rejects an empty (0-byte) file with BusinessRuleError(InvalidByteSize) before reaching the unit-of-work", async () => {
    // Without this guard the empty payload reaches IngestionJob.insert and
    // the DB CHECK constraint surfaces as a `kind=conflict,
    // code=CONSTRAINT_VIOLATION`, which renders as the misleading
    // "他の操作と競合しました" message in the UI (#221).
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);

    const { stream } = makeStream("");
    try {
      await uploadFile({
        container,
        input: {
          actorUserId: owner,
          originalFileName: "empty.md",
          mimeType: "text/markdown",
          byteSize: 0,
          bodyStream: stream,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(IngestionErrorCode.InvalidByteSize);
    }

    const rows = await container.db.select().from(schema.ingestionJobs);
    expect(rows).toHaveLength(0);
  });

  it("rejects an unsupported format (e.g. application/zip) with BusinessRuleError(UnsupportedFormat)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);

    const { stream, byteSize } = makeStream("PK\x03\x04");
    try {
      await uploadFile({
        container,
        input: {
          actorUserId: owner,
          originalFileName: "archive.zip",
          mimeType: "application/zip",
          byteSize,
          bodyStream: stream,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(IngestionErrorCode.UnsupportedFormat);
    }

    const rows = await container.db.select().from(schema.ingestionJobs);
    expect(rows).toHaveLength(0);
  });

  it("rejects an upload exceeding the per-kind byte cap with BusinessRuleError(ByteSizeExceedsLimit)", async () => {
    const container = getContainer();
    // Tight cap so we can probe just over the limit without writing
    // megabytes through the encoder.
    await seedInstanceSettings(container, { maxIngestionBytes: 128 });
    const owner = await seedUser(container);

    const oversize = 129;
    try {
      await uploadFile({
        container,
        input: {
          actorUserId: owner,
          originalFileName: "big.html",
          mimeType: "text/html",
          byteSize: oversize,
          bodyStream: makeStreamOfSize(oversize),
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(IngestionErrorCode.ByteSizeExceedsLimit);
    }

    const rows = await container.db.select().from(schema.ingestionJobs);
    expect(rows).toHaveLength(0);
  });

  it("rejects an upload once the day's quota is exhausted with daily_upload_quota_exceeded", async () => {
    const container = getContainer();
    await seedInstanceSettings(container, {
      maxIngestionBytes: 1_000_000,
      maxUploadBytesPerDay: 100,
    });
    const owner = await seedUser(container);
    // Seed a prior job that consumed nearly all of today's quota.
    // `sumByteSizeByOwnerSince` filters on `createdAt >= now - 24h`, so
    // the seed must carry a recent timestamp — otherwise the SUM falls
    // back to 0 and the quota gate never fires.
    const recent = new Date().toISOString();
    await seedIngestionJob(container, {
      ownerId: owner,
      status: "saved",
      byteSize: 90,
      tempStorageKey: null,
      previewJson: defaultPreviewJson(),
      savedAsNoteId: null,
      createdAt: recent,
      updatedAt: recent,
    });

    const { stream, byteSize } = makeStream("<p>nope</p>");
    try {
      await uploadFile({
        container,
        input: {
          actorUserId: owner,
          originalFileName: "more.html",
          mimeType: "text/html",
          byteSize,
          bodyStream: stream,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      // ADR-004 #14: spec ↔ implementation literal mismatch.
      // `uploadFile.ts` throws BusinessRuleError with the bare string
      // "daily_upload_quota_exceeded"; `IngestionErrorCode` has no entry
      // for this case, unlike every other ingestion failure. Keep the
      // literal in sync with the usecase string until the enum gains a
      // matching member.
      expect(error.code).toBe("daily_upload_quota_exceeded");
    }
  });

  it("persists per-upload prompt overrides on insert and round-trips them via findById", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);

    const { stream, byteSize } = makeStream("<p>hi</p>");
    const { jobId } = await uploadFile({
      container,
      input: {
        actorUserId: owner,
        originalFileName: "ov.html",
        mimeType: "text/html",
        byteSize,
        bodyStream: stream,
        promptOverride: { structure: "  S-OVERRIDE  ", metadata: "M-OVERRIDE" },
      },
    });

    // Raw columns carry the trimmed override.
    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.structurePromptOverride).toBe("S-OVERRIDE");
    expect(rows[0]?.metadataPromptOverride).toBe("M-OVERRIDE");

    // findById rehydrates them onto the aggregate.
    const reloaded = await container.unitOfWorkProvider.run(
      async ({ ingestionJobRepository }) =>
        ingestionJobRepository.findById(
          jobId as unknown as Parameters<
            typeof ingestionJobRepository.findById
          >[0],
        ),
    );
    expect(reloaded?.entity.promptOverride.structure as unknown as string).toBe(
      "S-OVERRIDE",
    );
    expect(reloaded?.entity.promptOverride.metadata as unknown as string).toBe(
      "M-OVERRIDE",
    );
  });

  it("leaves override columns unchanged across a save() lifecycle transition (provenance, ADR-002)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);

    const { stream, byteSize } = makeStream("<p>hi</p>");
    const { jobId } = await uploadFile({
      container,
      input: {
        actorUserId: owner,
        originalFileName: "ov2.html",
        mimeType: "text/html",
        byteSize,
        bodyStream: stream,
        promptOverride: { structure: "S-KEEP", metadata: "M-KEEP" },
      },
    });

    // Run a save-path transition (pending → processing).
    await container.unitOfWorkProvider.run(
      async ({ ingestionJobRepository, collectEvents }) => {
        const found = await ingestionJobRepository.findById(
          jobId as unknown as Parameters<
            typeof ingestionJobRepository.findById
          >[0],
        );
        if (found === null) throw new Error("seed job missing");
        const { IngestionJob } = await import("@/core/domain/ingestion/entity");
        const transition = IngestionJob.startProcessing(
          found.entity,
          new Date(),
        );
        await ingestionJobRepository.save(
          transition.entity,
          found.expectedVersion,
        );
        collectEvents(transition.eventDrafts);
      },
    );

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("processing");
    expect(rows[0]?.structurePromptOverride).toBe("S-KEEP");
    expect(rows[0]?.metadataPromptOverride).toBe("M-KEEP");
  });
});

describe("regenerateIngestionPreview", () => {
  // spec: spec/testcases/ingestion/index.md#RegenerateIngestionPreview
  const getContainer = setupTestContainer();

  it("bumps regenerationCount, returns the job to pending, and emits ingestion.regenerated for a previewing job", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      regenerationCount: 2,
    });

    await regenerateIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId: jobId,
      },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("pending");
    expect(rows[0]?.regenerationCount).toBe(3);
    expect(rows[0]?.previewJson).toBeNull();

    const events = await container.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.aggregateId, jobId));
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("ingestion.regenerated");
  });

  it("rejects the 6th regeneration once the cap is reached with BusinessRuleError(RegenerationLimitExceeded)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      regenerationCount: 5,
    });

    try {
      await regenerateIngestionPreview({
        container,
        input: {
          actorUserId: owner,
          jobId: jobId,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(IngestionErrorCode.RegenerationLimitExceeded);
    }
  });

  it("rejects regeneration of a failed job with BusinessRuleError(InvalidStateForRegenerate)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "failed",
      previewJson: null,
      errorCode: "llm_failure",
      errorReason: "upstream 500",
    });

    try {
      await regenerateIngestionPreview({
        container,
        input: {
          actorUserId: owner,
          jobId: jobId,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(IngestionErrorCode.InvalidStateForRegenerate);
    }
  });
});

describe("commitIngestionPreview", () => {
  // spec: spec/testcases/ingestion/index.md#CommitIngestionPreview
  const getContainer = setupTestContainer();

  it("creates a Note, transitions the job to saved, deletes temp bytes, and emits ingestion.committed", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    await seedDirectory(container, owner);
    const tempKey = `${owner}/ingestion/committed-1`;
    await container.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
    });

    const { noteId } = await commitIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId: jobId,
        modifications: {},
      },
    });

    const noteRows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId));
    expect(noteRows).toHaveLength(1);

    const jobRows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(jobRows[0]?.status).toBe("saved");
    expect(jobRows[0]?.savedAsNoteId).toBe(noteId);
    expect(jobRows[0]?.tempStorageKey).toBeNull();

    const tempStorage = container.tempFileStorage as unknown as {
      has(key: string): boolean;
    };
    expect(tempStorage.has(tempKey)).toBe(false);

    const events = await container.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.aggregateId, jobId));
    const types = events.map((e) => e.eventType);
    expect(types).toContain("ingestion.committed");
  });

  // Issue #452: commit persists the source file as a kind='source'
  // attached MediaAsset, binds it via notes.source_file_id, copies the
  // bytes to permanent object storage, and removes the temp file.
  it("persists the ingested source file and binds it to the note (Issue #452)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    await seedDirectory(container, owner);
    const tempKey = `${owner}/ingestion/source-1`;
    await container.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
      mimeType: "application/pdf",
      originalFileName: "report.pdf",
      byteSize: 4,
    });

    const { noteId } = await commitIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId: jobId,
        modifications: {},
      },
    });

    const noteRows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId));
    const sourceFileId = noteRows[0]?.sourceFileId;
    expect(sourceFileId).not.toBeNull();
    expect(sourceFileId).toBeDefined();

    const mediaRows = await container.db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, sourceFileId as string));
    expect(mediaRows).toHaveLength(1);
    expect(mediaRows[0]?.kind).toBe("source");
    expect(mediaRows[0]?.status).toBe("attached");
    expect(mediaRows[0]?.refCount).toBe(1);
    expect(mediaRows[0]?.originalFileName).toBe("report.pdf");
    expect(mediaRows[0]?.storageKey).toBe(`${owner}/source/${sourceFileId}`);

    // Bytes copied to permanent storage; `stat` throws if absent.
    const meta = await container.objectStorage.stat(
      mediaRows[0]?.storageKey as string,
    );
    expect(meta.contentType).toBe("application/pdf");

    // Temp file reclaimed after the copy.
    const tempStorage = container.tempFileStorage as unknown as {
      has(key: string): boolean;
    };
    expect(tempStorage.has(tempKey)).toBe(false);
  });

  // Issue #468 (AC-2): when the source blob is persisted but the main
  // UoW rolls back, the metadata-first `pending(kind='source')` row and
  // the blob both survive the failed commit and ride the
  // sweep → purgeOrphans chain to full reclaim — no manual intervention.
  it("reclaims the source blob after a commit rollback via sweep → purge (Issue #468)", async () => {
    const base = getContainer();
    await seedInstanceSettings(base);
    const owner = await seedUser(base);
    await seedDirectory(base, owner);
    const tempKey = `${owner}/ingestion/rollback-1`;
    await base.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(base, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
      mimeType: "application/pdf",
      originalFileName: "report.pdf",
      byteSize: 4,
    });

    // Pin the clock so the strict `<` cutoff of the sweep / purge
    // candidate queries can be crossed deterministically (same pattern
    // as purgeOrphans.integration.test.ts).
    const commitTime = new Date("2026-06-01T00:00:00.000Z");
    const withClock = (at: Date): TestContainer => ({
      ...base,
      clock: { now: () => at },
    });

    // A non-existent target directory makes the main UoW throw
    // NotFoundError AFTER stage (a) persisted the pending row + blob.
    try {
      await commitIngestionPreview({
        container: withClock(commitTime),
        input: {
          actorUserId: owner,
          jobId: jobId,
          modifications: { directoryId: nextDirId() },
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }

    // The rollback left the pending/source row and its blob behind.
    const mediaRows = await base.db.select().from(schema.mediaAssets);
    expect(mediaRows).toHaveLength(1);
    expect(mediaRows[0]?.kind).toBe("source");
    expect(mediaRows[0]?.status).toBe("pending");
    const storageKey = mediaRows[0]?.storageKey as string;
    const meta = await base.objectStorage.stat(storageKey);
    expect(meta.byteSize).toBe(4);

    // The job itself was untouched by the rollback.
    const jobRows = await base.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(jobRows[0]?.status).toBe("previewing");

    // Stage (a) collects no events and the rolled-back main UoW discards
    // its buffered ones, so the failed commit must not leak media.* rows
    // (e.g. media.created) into the outbox.
    const outboxAfterRollback = await base.db
      .select()
      .from(schema.outboxEvents);
    expect(
      outboxAfterRollback.filter((e) => e.eventType.startsWith("media.")),
    ).toHaveLength(0);

    // The temp blob is preserved too — temp delete runs only after a
    // successful UoW — so the same job can be re-committed.
    const tempStorage = base.tempFileStorage as unknown as {
      has(key: string): boolean;
    };
    expect(tempStorage.has(tempKey)).toBe(true);

    // Re-committing the same job with a valid input completes on a fresh
    // pending row + blob; the abandoned row stays pending and does not
    // interfere with the retry.
    const abandonedId = mediaRows[0]?.id as string;
    const recommitTime = new Date(commitTime.getTime() + 30_000);
    const { noteId } = await commitIngestionPreview({
      container: withClock(recommitTime),
      input: { actorUserId: owner, jobId: jobId, modifications: {} },
    });
    const noteRows = await base.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId));
    expect(noteRows).toHaveLength(1);
    const newSourceId = noteRows[0]?.sourceFileId as string;
    expect(newSourceId).not.toBeNull();
    expect(newSourceId).not.toBe(abandonedId);
    const afterRecommit = await base.db.select().from(schema.mediaAssets);
    expect(afterRecommit).toHaveLength(2);
    expect(afterRecommit.find((r) => r.id === newSourceId)?.status).toBe(
      "attached",
    );
    expect(afterRecommit.find((r) => r.id === abandonedId)?.status).toBe(
      "pending",
    );

    // Sweep (grace 0, clock advanced past the row's updatedAt) orphans
    // only the abandoned intake; the re-committed source is attached and
    // out of scope.
    const sweepTime = new Date(commitTime.getTime() + 60_000);
    const sweepResult = await sweepAbandonedSourceIntakes(
      withClock(sweepTime),
      { graceSec: 0 },
    );
    expect(sweepResult).toEqual({ swept: 1, failed: 0 });
    const afterSweep = await base.db.select().from(schema.mediaAssets);
    expect(afterSweep.find((r) => r.id === abandonedId)?.status).toBe("orphan");
    expect(afterSweep.find((r) => r.id === newSourceId)?.status).toBe(
      "attached",
    );

    // A single purge call finalises markDeleting → purge in the same
    // iteration; advance the clock again so the re-stamped orphan
    // updatedAt clears the strict `<` cutoff.
    const purgeTime = new Date(sweepTime.getTime() + 60_000);
    const purgeResult = await purgeOrphans(withClock(purgeTime), {
      orphanAgeSec: 0,
    });
    expect(purgeResult).toEqual({ purged: 1, failed: 0 });

    // Only the abandoned intake was reclaimed; the live note's source
    // row and blob survive.
    const afterPurge = await base.db.select().from(schema.mediaAssets);
    expect(afterPurge).toHaveLength(1);
    expect(afterPurge[0]?.id).toBe(newSourceId);
    await expect(base.objectStorage.stat(storageKey)).rejects.toThrow();
    await expect(
      base.objectStorage.stat(afterPurge[0]?.storageKey as string),
    ).resolves.toBeDefined();
  });

  // Issue #468 (ADR-002): metadata-first means stage (a) commits the
  // pending row BEFORE the R2 put, so a put failure leaves a blobless
  // `pending(kind='source')` row — never a rowless blob — and that row
  // rides the sweep → purge chain to reclaim. Guards the row-before-put
  // ordering: with the order reversed, a failed put would leave no
  // pending row and this test fails.
  it("leaves a reclaimable pending row and no blob when the source put fails (Issue #468)", async () => {
    const base = getContainer();
    await seedInstanceSettings(base);
    const owner = await seedUser(base);
    await seedDirectory(base, owner);
    const tempKey = `${owner}/ingestion/put-failure-1`;
    await base.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(base, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
      mimeType: "application/pdf",
      originalFileName: "report.pdf",
      byteSize: 4,
    });

    const commitTime = new Date("2026-06-01T00:00:00.000Z");
    const withClock = (at: Date): TestContainer => ({
      ...base,
      clock: { now: () => at },
    });

    try {
      await commitIngestionPreview({
        container: {
          ...withClock(commitTime),
          objectStorage: new PutThrowingObjectStorage(base.objectStorage),
        },
        input: {
          actorUserId: owner,
          jobId: jobId,
          modifications: {},
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isSystemError(error)) {
        throw error;
      }
      expect(error.code).toBe(SystemErrorCode.ExternalApiError);
    }

    // Stage (a)'s pending/source row survives the failed put; the blob
    // was never written.
    const mediaRows = await base.db.select().from(schema.mediaAssets);
    expect(mediaRows).toHaveLength(1);
    expect(mediaRows[0]?.kind).toBe("source");
    expect(mediaRows[0]?.status).toBe("pending");
    const storageKey = mediaRows[0]?.storageKey as string;
    await expect(base.objectStorage.stat(storageKey)).rejects.toThrow();

    // Note and job are untouched — the failure happened before the main
    // UoW, so the commit can simply be retried.
    expect(await base.db.select().from(schema.notes)).toHaveLength(0);
    const jobRows = await base.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(jobRows[0]?.status).toBe("previewing");

    // Stage (a) collects no events (its small UoW commits independently,
    // so a buffered media.created would survive the failed commit), and
    // the main UoW was never reached — the outbox must stay free of
    // media.* rows.
    const outboxAfterFailure = await base.db.select().from(schema.outboxEvents);
    expect(
      outboxAfterFailure.filter((e) => e.eventType.startsWith("media.")),
    ).toHaveLength(0);

    // The stranded row rides the standard reclaim chain: sweep orphans
    // it, purge deletes it (the `delete` idempotency contract covers the
    // missing blob).
    const sweepTime = new Date(commitTime.getTime() + 60_000);
    const sweepResult = await sweepAbandonedSourceIntakes(
      withClock(sweepTime),
      { graceSec: 0 },
    );
    expect(sweepResult).toEqual({ swept: 1, failed: 0 });

    const purgeTime = new Date(sweepTime.getTime() + 60_000);
    const purgeResult = await purgeOrphans(withClock(purgeTime), {
      orphanAgeSec: 0,
    });
    expect(purgeResult).toEqual({ purged: 1, failed: 0 });
    expect(await base.db.select().from(schema.mediaAssets)).toHaveLength(0);
  });

  // Issue #468: the main UoW re-reads the stage (a) row and guards it
  // with `findById → isPending` — both fail-loud arms (row vanished, row
  // no longer pending) must surface SystemError(DataIntegrityError) and
  // roll the whole main UoW back rather than silently dropping the
  // source binding. The usecase runs three UoWs in order: (1) job
  // projection read, (2) stage (a) pending-row insert, (3) main UoW —
  // mutating the row just before the third run drives the guard on the
  // real path.
  it("fails loud with SystemError(DataIntegrityError) when the stage (a) row vanishes before the main UoW (Issue #468)", async () => {
    const base = getContainer();
    await seedInstanceSettings(base);
    const owner = await seedUser(base);
    await seedDirectory(base, owner);
    const tempKey = `${owner}/ingestion/integrity-1`;
    await base.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(base, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
      mimeType: "application/pdf",
      originalFileName: "report.pdf",
      byteSize: 4,
    });

    let uowRuns = 0;
    const container: TestContainer = {
      ...base,
      unitOfWorkProvider: {
        run: async (fn) => {
          uowRuns += 1;
          if (uowRuns === 3) {
            await base.db.delete(schema.mediaAssets);
          }
          return base.unitOfWorkProvider.run(fn);
        },
      },
    };

    try {
      await commitIngestionPreview({
        container,
        input: { actorUserId: owner, jobId: jobId, modifications: {} },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isSystemError(error)) {
        throw error;
      }
      expect(error.code).toBe(SystemErrorCode.DataIntegrityError);
    }
    // Pin the 3-UoW topology the mutation hook above relies on.
    expect(uowRuns).toBe(3);

    // The main UoW rolled back whole: no note, job untouched.
    expect(await base.db.select().from(schema.notes)).toHaveLength(0);
    const jobRows = await base.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(jobRows[0]?.status).toBe("previewing");
  });

  it("fails loud with SystemError(DataIntegrityError) when the stage (a) row is no longer pending at the main UoW (Issue #468)", async () => {
    const base = getContainer();
    await seedInstanceSettings(base);
    const owner = await seedUser(base);
    await seedDirectory(base, owner);
    const tempKey = `${owner}/ingestion/integrity-2`;
    await base.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(base, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
      mimeType: "application/pdf",
      originalFileName: "report.pdf",
      byteSize: 4,
    });

    let uowRuns = 0;
    const container: TestContainer = {
      ...base,
      unitOfWorkProvider: {
        run: async (fn) => {
          uowRuns += 1;
          if (uowRuns === 3) {
            await base.db
              .update(schema.mediaAssets)
              .set({ status: "attached", refCount: 1 });
          }
          return base.unitOfWorkProvider.run(fn);
        },
      },
    };

    try {
      await commitIngestionPreview({
        container,
        input: { actorUserId: owner, jobId: jobId, modifications: {} },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isSystemError(error)) {
        throw error;
      }
      expect(error.code).toBe(SystemErrorCode.DataIntegrityError);
    }
    // Pin the 3-UoW topology the mutation hook above relies on.
    expect(uowRuns).toBe(3);

    expect(await base.db.select().from(schema.notes)).toHaveLength(0);
    const jobRows = await base.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(jobRows[0]?.status).toBe("previewing");
  });

  // Issue #127: the ingestion commit path runs the same
  // `assembleFromInputs` pipeline, so `[[Existing Title]]` in the
  // preview body must resolve to the target note id and produce a
  // backlink.
  it("resolves [[Existing Title]] in the ingested body to the target note id (backlink connected)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const dirId = await seedDirectory(container, owner);
    const targetNoteId = nextNoteId();
    await container.db.insert(schema.notes).values({
      id: targetNoteId,
      ownerId: owner,
      directoryId: dirId,
      slug: `slug-${targetNoteId.slice(-6)}`,
      title: "Target Note",
      contentHtml: "<p>target</p>",
      frontMatterJson: "{}",
      status: "active",
      trashedAt: null,
      createdAt: iso(0),
      updatedAt: iso(0),
      editLockUserId: null,
      editLockAcquiredAt: null,
      editLockExpiresAt: null,
      version: 0,
    });

    const tempKey = `${owner}/ingestion/committed-link`;
    await container.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
      previewJson: JSON.stringify({
        title: "Ingested",
        contentHtml: "<p>see [[target note]]</p>",
        suggestedDirectoryId: dirId,
        suggestedDirectoryName: null,
        frontMatter: {},
        suggestedTagNames: [],
        internalLinkRefs: [],
        mediaRefs: [],
      }),
    });

    const { noteId } = await commitIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId: jobId,
        modifications: {},
      },
    });

    const links = await container.db
      .select()
      .from(schema.noteInternalLinks)
      .where(eq(schema.noteInternalLinks.fromNoteId, noteId));
    expect(links).toHaveLength(1);
    expect(links[0]?.resolvedNoteId).toBe(targetNoteId);

    const referrers = await container.unitOfWorkProvider.run(
      async ({ noteRepository }) =>
        noteRepository.findReferrers(targetNoteId as unknown as DomainNoteId),
    );
    expect(referrers.map((n) => n.id)).toContain(noteId);
  });

  it("creates a new directory under root when modifications.directoryNameToCreate is set", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const tempKey = `${owner}/ingestion/committed-2`;
    await container.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
    });

    const { noteId } = await commitIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId: jobId,
        modifications: { directoryNameToCreate: "ingested" },
      },
    });

    const noteRows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId));
    expect(noteRows).toHaveLength(1);
    const createdDirId = noteRows[0]?.directoryId;
    const dirRows = await container.db
      .select()
      .from(schema.directories)
      .where(
        and(
          eq(schema.directories.ownerId, owner),
          eq(schema.directories.name, "ingested"),
        ),
      );
    expect(dirRows).toHaveLength(1);
    expect(dirRows[0]?.id).toBe(createdDirId);
  });

  it("creates a nested directory path (root → 技術 → AI) when directoryNameToCreate is a slash-delimited path", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const tempKey = `${owner}/ingestion/committed-nested`;
    await container.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
    });

    const { noteId } = await commitIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId: jobId,
        modifications: { directoryNameToCreate: "技術/AI" },
      },
    });

    const noteRows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId));
    const leafId = noteRows[0]?.directoryId;

    const all = await container.db
      .select()
      .from(schema.directories)
      .where(eq(schema.directories.ownerId, owner));
    const tech = all.find((d) => d.name === "技術");
    const ai = all.find((d) => d.name === "AI");
    const root = all.find((d) => d.parentId === null);
    expect(tech).toBeDefined();
    expect(ai).toBeDefined();
    expect(ai?.id).toBe(leafId);
    expect(ai?.parentId).toBe(tech?.id);
    expect(tech?.parentId).toBe(root?.id);
    expect(ai?.depth).toBe(2);
  });

  it("reuses an existing intermediate directory (技術) and only creates the missing leaf (AI)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const rootId = await seedDirectory(container, owner);
    // Pre-existing 技術 under root.
    const techId = nextDirId();
    await container.db.insert(schema.directories).values({
      id: techId,
      ownerId: owner,
      parentId: rootId,
      name: "技術",
      slug: `tech-${techId.slice(-6)}`,
      depth: 1,
      version: 0,
      createdAt: iso(0),
      updatedAt: iso(0),
    });
    const tempKey = `${owner}/ingestion/committed-merge`;
    await container.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
    });

    const { noteId } = await commitIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId: jobId,
        modifications: { directoryNameToCreate: "技術/AI" },
      },
    });

    const techRows = await container.db
      .select()
      .from(schema.directories)
      .where(
        and(
          eq(schema.directories.ownerId, owner),
          eq(schema.directories.name, "技術"),
        ),
      );
    // 技術 was reused, not duplicated.
    expect(techRows).toHaveLength(1);
    expect(techRows[0]?.id).toBe(techId);

    const noteRows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId));
    const aiRows = await container.db
      .select()
      .from(schema.directories)
      .where(
        and(
          eq(schema.directories.ownerId, owner),
          eq(schema.directories.name, "AI"),
        ),
      );
    expect(aiRows).toHaveLength(1);
    expect(aiRows[0]?.parentId).toBe(techId);
    expect(aiRows[0]?.id).toBe(noteRows[0]?.directoryId);
  });

  it("is idempotent: committing the same nested path twice reuses all directories on the second commit", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);

    const commitWithPath = async (key: string) => {
      await container.tempFileStorage.put(key, new ArrayBuffer(4));
      const jobId = await seedIngestionJob(container, {
        ownerId: owner,
        status: "previewing",
        tempStorageKey: key,
      });
      await commitIngestionPreview({
        container,
        input: {
          actorUserId: owner,
          jobId: jobId,
          modifications: { directoryNameToCreate: "技術/AI" },
        },
      });
    };

    await commitWithPath(`${owner}/ingestion/idem-1`);
    const afterFirst = await container.db
      .select()
      .from(schema.directories)
      .where(eq(schema.directories.ownerId, owner));
    await commitWithPath(`${owner}/ingestion/idem-2`);
    const afterSecond = await container.db
      .select()
      .from(schema.directories)
      .where(eq(schema.directories.ownerId, owner));

    // No new directories on the second commit — root, 技術, AI all reused.
    expect(afterSecond.length).toBe(afterFirst.length);
  });

  it("throws TooDeep when directoryNameToCreate exceeds MAX_DIRECTORY_DEPTH", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const tempKey = `${owner}/ingestion/committed-toodeep`;
    await container.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
    });
    const tooDeep = Array.from({ length: 11 }, (_, i) => `d${i}`).join("/");

    try {
      await commitIngestionPreview({
        container,
        input: {
          actorUserId: owner,
          jobId: jobId,
          modifications: { directoryNameToCreate: tooDeep },
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) throw error;
      expect(error.code).toBe(DirectoryErrorCode.TooDeep);
    }
  });

  it("creates the preview's suggested nested path when no modifications override it (IngestionJobRow quick-commit path)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const tempKey = `${owner}/ingestion/quick-nested`;
    await container.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    // Quick-commit forwards preview.suggestedDirectoryName as
    // directoryNameToCreate; this also covers the usecase fallback that
    // reads the preview directly when no modification is supplied.
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
      previewJson: JSON.stringify({
        title: "Quick",
        contentHtml: "<p>quick</p>",
        suggestedDirectoryId: null,
        suggestedDirectoryName: "研究/論文",
        frontMatter: {},
        suggestedTagNames: [],
        internalLinkRefs: [],
        mediaRefs: [],
      }),
    });

    const { noteId } = await commitIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId: jobId,
        modifications: {},
      },
    });

    const noteRows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId));
    const all = await container.db
      .select()
      .from(schema.directories)
      .where(eq(schema.directories.ownerId, owner));
    const research = all.find((d) => d.name === "研究");
    const paper = all.find((d) => d.name === "論文");
    expect(research).toBeDefined();
    expect(paper).toBeDefined();
    expect(paper?.parentId).toBe(research?.id);
    expect(paper?.id).toBe(noteRows[0]?.directoryId);
  });

  it("overwrites the existing note when overwriteNoteId is supplied and the actor owns the target", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const dirId = await seedDirectory(container, owner);
    // Pre-existing note that the commit will overwrite.
    const existingNoteId = nextNoteId();
    await container.db.insert(schema.notes).values({
      id: existingNoteId,
      ownerId: owner,
      directoryId: dirId,
      slug: `slug-${existingNoteId.slice(-6)}`,
      title: "Original",
      contentHtml: "<p>original</p>",
      frontMatterJson: "{}",
      status: "active",
      trashedAt: null,
      createdAt: iso(0),
      updatedAt: iso(0),
      editLockUserId: null,
      editLockAcquiredAt: null,
      editLockExpiresAt: null,
      version: 0,
    });
    const tempKey = `${owner}/ingestion/committed-3`;
    await container.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
    });

    const { noteId } = await commitIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId: jobId,
        modifications: {
          overwriteNoteId: existingNoteId,
        },
      },
    });

    expect(noteId).toBe(existingNoteId);
    const noteRows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, existingNoteId));
    expect(noteRows).toHaveLength(1);
    expect(noteRows[0]?.title).toBe("Preview Title");
    expect(noteRows[0]?.version).toBe(1);

    const events = await container.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.aggregateId, jobId));
    const types = events.map((e) => e.eventType);
    expect(types).toContain("ingestion.committed");
  });

  // Issue #452 / ADR-005: overwriting a note that already carries a
  // persistent source file swaps `notes.source_file_id` to the new asset
  // and orphans the old source (refCount 1 → 0) so the purge worker
  // reclaims its blob — no permanent orphan.
  it("orphans the old source file and rebinds to the new one when overwriting a note that already has a source (Issue #452)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const dirId = await seedDirectory(container, owner);
    // Pre-existing source asset (attached/refCount=1) bound to the note.
    const oldSourceId = nextMediaId();
    await container.db.insert(schema.mediaAssets).values({
      id: oldSourceId,
      ownerId: owner,
      kind: "source",
      mimeType: "application/pdf",
      byteSize: 4,
      backend: "r2",
      storageKey: `${owner}/source/${oldSourceId}`,
      originalFileName: "old.pdf",
      width: null,
      height: null,
      durationMs: null,
      refCount: 1,
      status: "attached",
      createdAt: iso(0),
      updatedAt: iso(0),
    });
    const existingNoteId = nextNoteId();
    await container.db.insert(schema.notes).values({
      id: existingNoteId,
      ownerId: owner,
      directoryId: dirId,
      slug: `slug-${existingNoteId.slice(-6)}`,
      title: "Original",
      contentHtml: "<p>original</p>",
      frontMatterJson: "{}",
      status: "active",
      trashedAt: null,
      sourceFileId: oldSourceId,
      createdAt: iso(0),
      updatedAt: iso(0),
      editLockUserId: null,
      editLockAcquiredAt: null,
      editLockExpiresAt: null,
      version: 0,
    });
    const tempKey = `${owner}/ingestion/overwrite-source`;
    await container.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
      mimeType: "application/pdf",
      originalFileName: "new.pdf",
      byteSize: 4,
    });

    const { noteId } = await commitIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId: jobId,
        modifications: {
          overwriteNoteId: existingNoteId,
        },
      },
    });

    expect(noteId).toBe(existingNoteId);

    const noteRows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, existingNoteId));
    const newSourceId = noteRows[0]?.sourceFileId;
    // (1) note.source_file_id is rebound to a freshly created asset.
    expect(newSourceId).not.toBeNull();
    expect(newSourceId).not.toBe(oldSourceId);

    const newSourceRows = await container.db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, newSourceId as string));
    expect(newSourceRows[0]?.kind).toBe("source");
    expect(newSourceRows[0]?.status).toBe("attached");
    expect(newSourceRows[0]?.refCount).toBe(1);
    expect(newSourceRows[0]?.originalFileName).toBe("new.pdf");

    // (2) the old source is orphaned (refCount 0) for purge reclamation.
    const oldSourceRows = await container.db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.id, oldSourceId));
    expect(oldSourceRows[0]?.status).toBe("orphan");
    expect(oldSourceRows[0]?.refCount).toBe(0);
  });

  it("throws ForbiddenError before assembly when overwriteNoteId targets another user's note (Issue #127, ADR-006)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const actor = await seedUser(container);
    const stranger = await seedUser(container);
    const strangerDir = await seedDirectory(container, stranger);
    // Note owned by someone other than the actor.
    const foreignNoteId = nextNoteId();
    await container.db.insert(schema.notes).values({
      id: foreignNoteId,
      ownerId: stranger,
      directoryId: strangerDir,
      slug: `slug-${foreignNoteId.slice(-6)}`,
      title: "Foreign",
      contentHtml: "<p>foreign</p>",
      frontMatterJson: "{}",
      status: "active",
      trashedAt: null,
      createdAt: iso(0),
      updatedAt: iso(0),
      editLockUserId: null,
      editLockAcquiredAt: null,
      editLockExpiresAt: null,
      version: 0,
    });
    const tempKey = `${actor}/ingestion/overwrite-forbidden`;
    await container.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(container, {
      ownerId: actor,
      status: "previewing",
      tempStorageKey: tempKey,
    });

    const error = await commitIngestionPreview({
      container,
      input: {
        actorUserId: actor,
        jobId: jobId,
        modifications: {
          overwriteNoteId: foreignNoteId,
        },
      },
    }).then(
      () => null,
      (e) => e,
    );

    expect(error).not.toBeNull();
    expect(isForbiddenError(error)).toBe(true);
    // The foreign note is untouched (no overwrite happened).
    const rows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, foreignNoteId));
    expect(rows[0]?.title).toBe("Foreign");
    expect(rows[0]?.version).toBe(0);
  });

  it("persists modifications.frontMatter on the resulting note (Issue #226)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    await seedDirectory(container, owner);
    const tempKey = `${owner}/ingestion/committed-fm`;
    await container.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
    });

    const { noteId } = await commitIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId: jobId,
        modifications: {
          frontMatter: { status: "published", priority: 1 },
        },
      },
    });

    const noteRows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId));
    expect(noteRows).toHaveLength(1);
    const fm = JSON.parse(noteRows[0]?.frontMatterJson ?? "{}");
    expect(fm).toEqual({ status: "published", priority: 1 });
  });

  it("rejects commit on a pending (non-previewing) job with BusinessRuleError(InvalidStateForCommit)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "pending",
    });

    try {
      await commitIngestionPreview({
        container,
        input: {
          actorUserId: owner,
          jobId: jobId,
          modifications: {},
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(IngestionErrorCode.InvalidStateForCommit);
    }
  });

  // Issue #679: the form's tag list is authoritative. When the user
  // removes a suggested tag in the edit form and commits, the supplied
  // `tagNames` must NOT be re-merged with `preview.suggestedTagNames`,
  // or the deleted tag resurfaces on the saved note.
  async function tagNamesOnNote(
    container: TestContainer,
    noteId: string,
  ): Promise<string[]> {
    const rows = await container.db
      .select({ name: schema.tags.name })
      .from(schema.noteTags)
      .innerJoin(schema.tags, eq(schema.noteTags.tagId, schema.tags.id))
      .where(eq(schema.noteTags.noteId, noteId));
    return rows.map((r) => r.name).sort();
  }

  function previewWithSuggestedTags(tagNames: readonly string[]): string {
    return JSON.stringify({
      title: "Preview Title",
      contentHtml: "<p>preview body</p>",
      suggestedDirectoryId: null,
      suggestedDirectoryName: null,
      frontMatter: {},
      suggestedTagNames: tagNames,
      internalLinkRefs: [],
      mediaRefs: [],
    });
  }

  it("drops a removed suggested tag: the committed note keeps only the supplied tagNames (Issue #679)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    await seedDirectory(container, owner);
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      previewJson: previewWithSuggestedTags(["alpha", "beta"]),
    });

    const { noteId } = await commitIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId,
        // User deleted "beta" in the form; only "alpha" survives.
        modifications: { tagNames: ["alpha"] },
      },
    });

    expect(await tagNamesOnNote(container, noteId)).toEqual(["alpha"]);
  });

  it("commits no tags when the form clears the tag list (empty tagNames, Issue #679)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    await seedDirectory(container, owner);
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      previewJson: previewWithSuggestedTags(["alpha", "beta"]),
    });

    const { noteId } = await commitIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId,
        modifications: { tagNames: [] },
      },
    });

    expect(await tagNamesOnNote(container, noteId)).toEqual([]);
  });

  it("falls back to preview.suggestedTagNames when tagNames is omitted (Issue #679)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    await seedDirectory(container, owner);
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      previewJson: previewWithSuggestedTags(["alpha", "beta"]),
    });

    const { noteId } = await commitIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId,
        modifications: {},
      },
    });

    expect(await tagNamesOnNote(container, noteId)).toEqual(["alpha", "beta"]);
  });

  it("adds a user-supplied tag that was not in the suggestions (Issue #679)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    await seedDirectory(container, owner);
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      previewJson: previewWithSuggestedTags(["alpha"]),
    });

    const { noteId } = await commitIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId,
        modifications: { tagNames: ["alpha", "gamma"] },
      },
    });

    expect(await tagNamesOnNote(container, noteId)).toEqual(["alpha", "gamma"]);
  });

  it("replaces the overwritten note's tags with the supplied tagNames, dropping a removed suggested tag (Issue #679)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const dirId = await seedDirectory(container, owner);
    // Pre-existing note carrying a tag that must not survive the overwrite
    // unless the form still lists it.
    const oldTagId = nextTagId();
    await container.db.insert(schema.tags).values({
      id: oldTagId,
      ownerId: owner,
      name: "old",
      nameNormalized: "old",
      version: 0,
      createdAt: iso(0),
      updatedAt: iso(0),
    });
    const existingNoteId = nextNoteId();
    await container.db.insert(schema.notes).values({
      id: existingNoteId,
      ownerId: owner,
      directoryId: dirId,
      slug: `slug-${existingNoteId.slice(-6)}`,
      title: "Original",
      contentHtml: "<p>original</p>",
      frontMatterJson: "{}",
      status: "active",
      trashedAt: null,
      createdAt: iso(0),
      updatedAt: iso(0),
      editLockUserId: null,
      editLockAcquiredAt: null,
      editLockExpiresAt: null,
      version: 0,
    });
    await container.db
      .insert(schema.noteTags)
      .values({ noteId: existingNoteId, tagId: oldTagId });
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      previewJson: previewWithSuggestedTags(["alpha", "beta"]),
    });

    const { noteId } = await commitIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId,
        modifications: {
          overwriteNoteId: existingNoteId,
          // Form kept only "alpha"; "beta" suggestion and the note's
          // prior "old" tag must both be gone.
          tagNames: ["alpha"],
        },
      },
    });

    expect(noteId).toBe(existingNoteId);
    expect(await tagNamesOnNote(container, existingNoteId)).toEqual(["alpha"]);
  });
});

describe("discardIngestionPreview", () => {
  // spec: spec/testcases/ingestion/index.md#DiscardIngestionPreview
  const getContainer = setupTestContainer();

  it("transitions a previewing job to discarded and reclaims its temp blob", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const tempKey = `${owner}/ingestion/discard-1`;
    await container.tempFileStorage.put(tempKey, new ArrayBuffer(4));
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
      tempStorageKey: tempKey,
    });

    await discardIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId: jobId,
      },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("discarded");
    expect(rows[0]?.tempStorageKey).toBeNull();

    const tempStorage = container.tempFileStorage as unknown as {
      has(key: string): boolean;
    };
    expect(tempStorage.has(tempKey)).toBe(false);

    const events = await container.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.aggregateId, jobId));
    const types = events.map((e) => e.eventType);
    expect(types).toContain("ingestion.discarded");
  });

  it("transitions a failed job to discarded without removing a non-existent temp blob", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "failed",
      previewJson: null,
      tempStorageKey: null,
      errorCode: "llm_failure",
      errorReason: "upstream 500",
    });

    await discardIngestionPreview({
      container,
      input: {
        actorUserId: owner,
        jobId: jobId,
      },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("discarded");
  });

  it("rejects discard on a saved job with BusinessRuleError(InvalidStateForDiscard)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const dirId = await seedDirectory(container, owner);
    const noteIdRaw = nextNoteId();
    await container.db.insert(schema.notes).values({
      id: noteIdRaw,
      ownerId: owner,
      directoryId: dirId,
      slug: `n-${noteIdRaw.slice(-6)}`,
      title: "n",
      contentHtml: "<p>n</p>",
      frontMatterJson: "{}",
      status: "active",
      trashedAt: null,
      createdAt: iso(0),
      updatedAt: iso(0),
      editLockUserId: null,
      editLockAcquiredAt: null,
      editLockExpiresAt: null,
      version: 0,
    });
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "saved",
      tempStorageKey: null,
      savedAsNoteId: noteIdRaw,
    });

    try {
      await discardIngestionPreview({
        container,
        input: {
          actorUserId: owner,
          jobId: jobId,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) {
        throw error;
      }
      expect(error.code).toBe(IngestionErrorCode.InvalidStateForDiscard);
    }
  });
});

describe("getIngestionJob", () => {
  // spec: spec/testcases/ingestion/index.md#GetIngestionJobs / GetIngestionJob
  const getContainer = setupTestContainer();

  it("returns the DTO for the actor's own job", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const ownerA = await seedUser(container);
    const myJob = await seedIngestionJob(container, {
      ownerId: ownerA,
      status: "previewing",
    });

    const { job } = await getIngestionJob({
      container,
      input: {
        actorUserId: ownerA,
        jobId: myJob,
      },
    });
    expect(job.id).toBe(myJob);
    expect(job.status).toBe("previewing");
  });

  // ADR-004 #7: spec says AuthorizationError but the application layer has
  // no such class — ForbiddenError fulfils that role.
  it("throws ForbiddenError when the actor requests another user's job (spec: AuthorizationError)", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const ownerA = await seedUser(container);
    const ownerB = await seedUser(container);
    const otherJob = await seedIngestionJob(container, {
      ownerId: ownerB,
      status: "previewing",
    });

    try {
      await getIngestionJob({
        container,
        input: {
          actorUserId: ownerA,
          jobId: otherJob,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isForbiddenError(error)) {
        throw error;
      }
      expect(error.code).toBe("INGESTION_JOB_FORBIDDEN");
    }
  });
});

describe("getIngestionJobs", () => {
  // spec: spec/testcases/ingestion/index.md#GetIngestionJobs / GetIngestionJob
  const getContainer = setupTestContainer();

  it("returns only the actor's jobs and never another user's rows", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const ownerA = await seedUser(container);
    const ownerB = await seedUser(container);
    const a1 = await seedIngestionJob(container, {
      ownerId: ownerA,
      status: "previewing",
    });
    const a2 = await seedIngestionJob(container, {
      ownerId: ownerA,
      status: "pending",
    });
    await seedIngestionJob(container, {
      ownerId: ownerB,
      status: "previewing",
    });

    const { jobs } = await getIngestionJobs({
      container,
      input: { actorUserId: ownerA },
    });
    const ids = jobs.map((j) => j.id).sort();
    expect(ids).toEqual([a1, a2].sort());
  });

  it("excludes discarded jobs by default", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const previewing = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
    });
    await seedIngestionJob(container, {
      ownerId: owner,
      status: "discarded",
    });

    const { jobs } = await getIngestionJobs({
      container,
      input: { actorUserId: owner },
    });
    const ids = jobs.map((j) => j.id);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe(previewing);
  });

  it("includes discarded jobs when includeDiscarded is true", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const previewing = await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
    });
    const discarded = await seedIngestionJob(container, {
      ownerId: owner,
      status: "discarded",
    });

    const { jobs } = await getIngestionJobs({
      container,
      input: { actorUserId: owner, includeDiscarded: true },
    });
    const ids = jobs.map((j) => j.id).sort();
    expect(ids).toEqual([previewing, discarded].sort());
  });

  it("returns only discarded when status is 'discarded'", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    await seedIngestionJob(container, {
      ownerId: owner,
      status: "previewing",
    });
    const discarded = await seedIngestionJob(container, {
      ownerId: owner,
      status: "discarded",
    });

    const { jobs } = await getIngestionJobs({
      container,
      input: { actorUserId: owner, status: "discarded" },
    });
    const ids = jobs.map((j) => j.id);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe(discarded);
  });

  it("does not exclude discarded when status is explicitly set to non-discarded", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const dirId = await seedDirectory(container, owner);
    const noteIdRaw = nextNoteId();
    await container.db.insert(schema.notes).values({
      id: noteIdRaw,
      ownerId: owner,
      directoryId: dirId,
      slug: `n-${noteIdRaw.slice(-6)}`,
      title: "n",
      contentHtml: "<p>n</p>",
      frontMatterJson: "{}",
      status: "active",
      trashedAt: null,
      createdAt: iso(0),
      updatedAt: iso(0),
      editLockUserId: null,
      editLockAcquiredAt: null,
      editLockExpiresAt: null,
      version: 0,
    });
    const saved = await seedIngestionJob(container, {
      ownerId: owner,
      status: "saved",
      tempStorageKey: null,
      savedAsNoteId: noteIdRaw,
    });
    await seedIngestionJob(container, {
      ownerId: owner,
      status: "discarded",
    });

    const { jobs } = await getIngestionJobs({
      container,
      input: { actorUserId: owner, status: "saved" },
    });
    const ids = jobs.map((j) => j.id);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe(saved);
  });

  it("treats explicit status as winning when both status and includeDiscarded are provided", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const dirId = await seedDirectory(container, owner);
    const noteIdRaw = nextNoteId();
    await container.db.insert(schema.notes).values({
      id: noteIdRaw,
      ownerId: owner,
      directoryId: dirId,
      slug: `n-${noteIdRaw.slice(-6)}`,
      title: "n",
      contentHtml: "<p>n</p>",
      frontMatterJson: "{}",
      status: "active",
      trashedAt: null,
      createdAt: iso(0),
      updatedAt: iso(0),
      editLockUserId: null,
      editLockAcquiredAt: null,
      editLockExpiresAt: null,
      version: 0,
    });
    const saved = await seedIngestionJob(container, {
      ownerId: owner,
      status: "saved",
      tempStorageKey: null,
      savedAsNoteId: noteIdRaw,
    });
    await seedIngestionJob(container, {
      ownerId: owner,
      status: "discarded",
    });

    const { jobs } = await getIngestionJobs({
      container,
      input: { actorUserId: owner, status: "saved", includeDiscarded: true },
    });
    const ids = jobs.map((j) => j.id);
    expect(ids).toHaveLength(1);
    expect(ids[0]).toBe(saved);
  });
});

describe("bulkUpload", () => {
  // spec: spec/testcases/ingestion/index.md#BulkUpload
  const getContainer = setupTestContainer();

  it("partitions a mixed batch into jobIds (success) and failures (per-row BusinessRule errors)", async () => {
    const container = getContainer();
    // Cap so we can force a size_exceeded failure cheaply.
    await seedInstanceSettings(container, {
      maxIngestionBytes: 128,
      maxUploadBytesPerDay: 1_000_000,
    });
    const owner = await seedUser(container);

    const fileOk1 = makeStream("<p>a</p>");
    const fileOk2 = makeStream("<p>b</p>");
    const fileOk3 = makeStream("<p>c</p>");
    const fileUnsupportedStream = makeStream("PK");
    const fileTooLarge = makeStreamOfSize(200);

    const { jobIds, failures } = await bulkUpload({
      container,
      input: {
        actorUserId: owner,
        files: [
          {
            name: "a.html",
            mime: "text/html",
            size: fileOk1.byteSize,
            body: fileOk1.stream,
          },
          {
            name: "b.html",
            mime: "text/html",
            size: fileOk2.byteSize,
            body: fileOk2.stream,
          },
          {
            name: "c.html",
            mime: "text/html",
            size: fileOk3.byteSize,
            body: fileOk3.stream,
          },
          {
            name: "weird.zip",
            mime: "application/zip",
            size: fileUnsupportedStream.byteSize,
            body: fileUnsupportedStream.stream,
          },
          {
            name: "big.html",
            mime: "text/html",
            size: 200,
            body: fileTooLarge,
          },
        ],
      },
    });

    expect(jobIds).toHaveLength(3);
    expect(failures).toHaveLength(2);
    const reasons = failures.map((f) => f.reason).sort();
    expect(reasons).toEqual(
      [
        IngestionErrorCode.ByteSizeExceedsLimit,
        IngestionErrorCode.UnsupportedFormat,
      ].sort(),
    );

    const rows = await container.db.select().from(schema.ingestionJobs);
    expect(rows).toHaveLength(3);
  });
});
