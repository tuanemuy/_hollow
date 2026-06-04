import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import { isForbiddenError, isNotFoundError } from "@/core/application/errors";
import { isBusinessRuleError } from "@/core/domain/error";
import { ExportErrorCode } from "@/core/domain/export/errorCode";
import { setupTestContainer } from "../../__tests__/helpers";
import { retryExportJob } from "../retryExportJob";

const baseTime = new Date("2026-01-01T00:00:00.000Z");
const iso = (ms: number) => new Date(baseTime.getTime() + ms).toISOString();

let userSeq = 0;
function nextUserId(): string {
  userSeq += 1;
  return `019d0002-0000-7000-8000-${userSeq.toString(16).padStart(12, "0")}`;
}

let jobSeq = 0;
function nextJobId(): string {
  jobSeq += 1;
  return `019df001-0000-7000-8000-${jobSeq.toString(16).padStart(12, "0")}`;
}

let noteSeq = 0;
function nextNoteIdRaw(): string {
  noteSeq += 1;
  return `019d0100-0000-7000-8000-${noteSeq.toString(16).padStart(12, "0")}`;
}

beforeEach(() => {
  userSeq = 0;
  jobSeq = 0;
  noteSeq = 0;
});

async function seedUser(
  container: ReturnType<ReturnType<typeof setupTestContainer>>,
  role: "admin" | "member" = "admin",
  status: "active" | "deleted" | "suspended" = "active",
): Promise<string> {
  const id = nextUserId();
  await container.db.insert(schema.users).values({
    id,
    name: `user-${id.slice(-6)}`,
    email: `user-${id.slice(-6)}@example.test`,
    emailVerified: status === "active" ? 1 : 0,
    username: `user-${id.slice(-6)}`,
    role,
    banned: status === "suspended" ? 1 : 0,
    deletedAt: status === "deleted" ? iso(0) : null,
    createdAt: iso(0),
    updatedAt: iso(0),
  });
  return id;
}

type SeedExportJobInput = {
  ownerId: string;
  status: "pending" | "processing" | "failed" | "completed" | "cancelled";
  errorCode?: string | null;
  errorReason?: string | null;
  failedNoteIds?: readonly string[];
  progress?: { processed: number; total: number };
};

async function seedExportJob(
  container: ReturnType<ReturnType<typeof setupTestContainer>>,
  input: SeedExportJobInput,
): Promise<string> {
  const id = nextJobId();
  const noteId = nextNoteIdRaw();
  const failedNoteIds = input.failedNoteIds ?? [];
  const progress = input.progress ?? { processed: 0, total: 0 };
  const completedAt =
    input.status === "failed" || input.status === "cancelled" ? iso(1) : null;
  await container.db.insert(schema.exportJobs).values({
    id,
    ownerId: input.ownerId,
    format: "html",
    scope: "single",
    targetNoteIdsJson: JSON.stringify([noteId]),
    viewQueryJson: null,
    optionsJson: JSON.stringify({
      includeFrontMatter: false,
      embedMedia: false,
      pdfPaperSize: null,
    }),
    status: input.status,
    artifactKey: null,
    artifactSize: null,
    errorCode: input.errorCode ?? null,
    errorReason: input.errorReason ?? null,
    progressProcessed: progress.processed,
    progressTotal: progress.total,
    failedNoteIdsJson: JSON.stringify(failedNoteIds),
    version: 0,
    createdAt: iso(0),
    updatedAt: iso(0),
    completedAt,
    expiresAt: null,
  });
  return id;
}

describe("retryExportJob", () => {
  // spec: P46 G3 — admin can retry failed export jobs.
  //
  // Unlike ingestion retry, export retry does not require a
  // `tempStorageKey`-equivalent precondition (see ADR-001): the export
  // pipeline re-renders the source notes on every run, so the only
  // retry precondition is `status === 'failed'`.
  const getContainer = setupTestContainer();

  it("admin can retry a failed job: row returns to pending, errors / progress / failedNoteIds reset, version bumped, retryRequested event emitted", async () => {
    const container = getContainer();
    const admin = await seedUser(container, "admin");
    const member = await seedUser(container, "member");
    const failedNote = "019d0100-0000-7000-8000-0000000000ee";
    const jobId = await seedExportJob(container, {
      ownerId: member,
      status: "failed",
      errorCode: "pdf_render_error",
      errorReason: "engine timeout",
      failedNoteIds: [failedNote],
      progress: { processed: 2, total: 3 },
    });

    await retryExportJob({
      container,
      input: {
        actorUserId: admin,
        jobId: jobId,
      },
    });

    const rows = await container.db
      .select()
      .from(schema.exportJobs)
      .where(eq(schema.exportJobs.id, jobId));
    expect(rows[0]?.status).toBe("pending");
    expect(rows[0]?.errorCode).toBeNull();
    expect(rows[0]?.errorReason).toBeNull();
    expect(rows[0]?.completedAt).toBeNull();
    expect(rows[0]?.progressProcessed).toBe(0);
    expect(rows[0]?.progressTotal).toBe(0);
    expect(rows[0]?.failedNoteIdsJson).toBe("[]");
    expect(rows[0]?.version).toBe(1);

    const events = await container.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.aggregateId, jobId));
    const types = events.map((e) => e.eventType);
    expect(types).toContain("export.job.retryRequested");
  });

  it("non-admin actor is rejected with ForbiddenError", async () => {
    const container = getContainer();
    const member = await seedUser(container, "member");
    const jobId = await seedExportJob(container, {
      ownerId: member,
      status: "failed",
      errorCode: "pdf_render_error",
      errorReason: "boom",
    });

    try {
      await retryExportJob({
        container,
        input: {
          actorUserId: member,
          jobId: jobId,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isForbiddenError(error)).toBe(true);
    }
  });

  it("deleted admin actor is rejected with ForbiddenError", async () => {
    const container = getContainer();
    const deletedAdmin = await seedUser(container, "admin", "deleted");
    const member = await seedUser(container, "member");
    const jobId = await seedExportJob(container, {
      ownerId: member,
      status: "failed",
      errorCode: "pdf_render_error",
      errorReason: "boom",
    });

    try {
      await retryExportJob({
        container,
        input: {
          actorUserId: deletedAdmin,
          jobId: jobId,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isForbiddenError(error)).toBe(true);
    }
  });

  it("unknown job is rejected with NotFoundError", async () => {
    const container = getContainer();
    const admin = await seedUser(container, "admin");
    const missing = "019dffff-0000-7000-8000-000000000abc";

    try {
      await retryExportJob({
        container,
        input: {
          actorUserId: admin,
          jobId: missing,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
  });

  it("non-failed job is rejected with BusinessRuleError(InvalidStateForRetry)", async () => {
    const container = getContainer();
    const admin = await seedUser(container, "admin");
    const member = await seedUser(container, "member");
    const jobId = await seedExportJob(container, {
      ownerId: member,
      status: "processing",
    });

    try {
      await retryExportJob({
        container,
        input: {
          actorUserId: admin,
          jobId: jobId,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) throw error;
      expect(error.code).toBe(ExportErrorCode.InvalidStateForRetry);
    }
  });
});
