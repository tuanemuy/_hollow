import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import { isForbiddenError, isNotFoundError } from "@/core/application/errors";
import { isBusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import { setupTestContainer } from "../../__tests__/helpers";

import { ownerRetryIngestionJob } from "../ownerRetryIngestionJob";

const baseTime = new Date("2026-01-01T00:00:00.000Z");
const iso = (ms: number) => new Date(baseTime.getTime() + ms).toISOString();

let userSeq = 0;
function nextUserId(): string {
  userSeq += 1;
  return `019d0001-0000-7000-8000-${userSeq.toString(16).padStart(12, "0")}`;
}

let jobSeq = 0;
function nextJobId(): string {
  jobSeq += 1;
  return `019df000-0000-7000-8000-${jobSeq.toString(16).padStart(12, "0")}`;
}

beforeEach(() => {
  userSeq = 0;
  jobSeq = 0;
});

async function seedUser(
  container: ReturnType<ReturnType<typeof setupTestContainer>>,
  role: "admin" | "member" = "member",
): Promise<string> {
  const id = nextUserId();
  await container.db.insert(schema.users).values({
    id,
    name: `user-${id.slice(-6)}`,
    email: `user-${id.slice(-6)}@example.test`,
    emailVerified: 1,
    username: `user-${id.slice(-6)}`,
    role,
    banned: 0,
    deletedAt: null,
    createdAt: iso(0),
    updatedAt: iso(0),
  });
  return id;
}

type SeedJobInput = {
  ownerId: string;
  status:
    | "pending"
    | "processing"
    | "previewing"
    | "saved"
    | "failed"
    | "discarded";
  tempStorageKey?: string | null;
  errorCode?: string | null;
  errorReason?: string | null;
};

async function seedIngestionJob(
  container: ReturnType<ReturnType<typeof setupTestContainer>>,
  input: SeedJobInput,
): Promise<string> {
  const id = nextJobId();
  await container.db.insert(schema.ingestionJobs).values({
    id,
    ownerId: input.ownerId as unknown as string,
    originalFileName: "doc.html",
    mimeType: "text/html",
    byteSize: 16,
    kind: "html",
    status: input.status,
    tempStorageKey:
      input.tempStorageKey === undefined
        ? `${input.ownerId}/ingestion/${id}`
        : input.tempStorageKey,
    previewJson: null,
    errorCode: input.errorCode ?? null,
    errorReason: input.errorReason ?? null,
    regenerationCount: 0,
    savedAsNoteId: null,
    version: 0,
    createdAt: iso(0),
    updatedAt: iso(0),
  });
  return id;
}

describe("ownerRetryIngestionJob", () => {
  // spec/scenario/ingest.md B1 異常系 — owner can retry their own failed job.
  const getContainer = setupTestContainer();

  it("owner can retry their own failed job: row returns to pending, error fields cleared, version bumped, retryRequested event emitted", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "failed",
      errorCode: "llm_failure",
      errorReason: "upstream 500",
    });

    const result = await ownerRetryIngestionJob({
      container,
      input: {
        actorUserId: owner,
        jobId: jobId,
      },
    });
    expect(result.jobId as unknown as string).toBe(jobId);

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("pending");
    expect(rows[0]?.errorCode).toBeNull();
    expect(rows[0]?.errorReason).toBeNull();
    expect(rows[0]?.version).toBe(1);

    const events = await container.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.aggregateId, jobId));
    const types = events.map((e) => e.eventType);
    expect(types).toContain("ingestion.retryRequested");
  });

  it("retrying another user's job is rejected with ForbiddenError", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const intruder = await seedUser(container);
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "failed",
      errorCode: "llm_failure",
      errorReason: "boom",
    });

    try {
      await ownerRetryIngestionJob({
        container,
        input: {
          actorUserId: intruder,
          jobId: jobId,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isForbiddenError(error)).toBe(true);
    }
  });

  it("admin retrying another user's job is still rejected (owner-only authorization)", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const admin = await seedUser(container, "admin");
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "failed",
      errorCode: "llm_failure",
      errorReason: "boom",
    });

    try {
      await ownerRetryIngestionJob({
        container,
        input: {
          actorUserId: admin,
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
    const owner = await seedUser(container);
    const missing = "019dffff-0000-7000-8000-000000000000";

    try {
      await ownerRetryIngestionJob({
        container,
        input: {
          actorUserId: owner,
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
    const owner = await seedUser(container);
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "processing",
    });

    try {
      await ownerRetryIngestionJob({
        container,
        input: {
          actorUserId: owner,
          jobId: jobId,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) throw error;
      expect(error.code).toBe(IngestionErrorCode.InvalidStateForRetry);
    }
  });

  it("failed job with null tempStorageKey is rejected with BusinessRuleError(NoTempStorageForRetry)", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const jobId = await seedIngestionJob(container, {
      ownerId: owner,
      status: "failed",
      tempStorageKey: null,
      errorCode: "llm_failure",
      errorReason: "boom",
    });

    try {
      await ownerRetryIngestionJob({
        container,
        input: {
          actorUserId: owner,
          jobId: jobId,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) throw error;
      expect(error.code).toBe(IngestionErrorCode.NoTempStorageForRetry);
    }
  });
});
