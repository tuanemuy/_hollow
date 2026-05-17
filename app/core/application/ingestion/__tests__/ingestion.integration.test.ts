import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import { isForbiddenError } from "@/core/application/errors";
import { isBusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import {
  setupTestContainer,
  type TestContainer,
} from "../../__tests__/helpers";
import type { UserId } from "../../dto/identity";
import type { IngestionJobId } from "../../dto/ingestion";
import type { NoteId } from "../../dto/note";
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

async function seedUser(container: TestContainer): Promise<UserId> {
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
  return id as UserId;
}

async function seedDirectory(
  container: TestContainer,
  ownerId: UserId,
): Promise<string> {
  const id = nextDirId();
  await container.db.insert(schema.directories).values({
    id,
    ownerId: ownerId as unknown as string,
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
  ownerId: UserId;
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
    ownerId: input.ownerId as unknown as string,
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
      .where(eq(schema.ingestionJobs.id, jobId as unknown as string));
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
      .where(eq(schema.outboxEvents.aggregateId, jobId as unknown as string));
    expect(events).toHaveLength(1);
    expect(events[0]?.eventType).toBe("ingestion.created");

    // Body must be staged in temp storage.
    const tempStorage = container.tempFileStorage as unknown as {
      has(key: string): boolean;
    };
    expect(tempStorage.has(row.tempStorageKey as string)).toBe(true);
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
});

describe("regenerateIngestionPreview", () => {
  // spec: spec/testcases/ingestion/index.md#RegenerateIngestionPreview
  const getContainer = setupTestContainer();

  it("bumps regenerationCount, returns the job to processing, and emits ingestion.regenerated for a previewing job", async () => {
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
        jobId: jobId as unknown as IngestionJobId,
      },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("processing");
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
          jobId: jobId as unknown as IngestionJobId,
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
          jobId: jobId as unknown as IngestionJobId,
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
        jobId: jobId as unknown as IngestionJobId,
        modifications: {},
      },
    });

    const noteRows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId as unknown as string));
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
        jobId: jobId as unknown as IngestionJobId,
        modifications: { directoryNameToCreate: "ingested" },
      },
    });

    const noteRows = await container.db
      .select()
      .from(schema.notes)
      .where(eq(schema.notes.id, noteId as unknown as string));
    expect(noteRows).toHaveLength(1);
    const createdDirId = noteRows[0]?.directoryId;
    const dirRows = await container.db
      .select()
      .from(schema.directories)
      .where(
        and(
          eq(schema.directories.ownerId, owner as unknown as string),
          eq(schema.directories.name, "ingested"),
        ),
      );
    expect(dirRows).toHaveLength(1);
    expect(dirRows[0]?.id).toBe(createdDirId);
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
      ownerId: owner as unknown as string,
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
        jobId: jobId as unknown as IngestionJobId,
        modifications: {
          overwriteNoteId: existingNoteId as unknown as NoteId,
        },
      },
    });

    expect(noteId as unknown as string).toBe(existingNoteId);
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
          jobId: jobId as unknown as IngestionJobId,
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
        jobId: jobId as unknown as IngestionJobId,
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
        jobId: jobId as unknown as IngestionJobId,
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
      ownerId: owner as unknown as string,
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
          jobId: jobId as unknown as IngestionJobId,
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
        jobId: myJob as unknown as IngestionJobId,
      },
    });
    expect(job.id as unknown as string).toBe(myJob);
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
          jobId: otherJob as unknown as IngestionJobId,
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
    const ids = jobs.map((j) => j.id as unknown as string).sort();
    expect(ids).toEqual([a1, a2].sort());
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
