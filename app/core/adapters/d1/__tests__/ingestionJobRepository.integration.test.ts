import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { IngestionStatus } from "@/core/domain/ingestion/valueObject";
import * as schema from "../schema";
import { createTestContainer, type TestContainer } from "./helpers";

/**
 * Integration tests for `D1IngestionJobRepository.countByOwner`
 * (Issue #538): `status IN (...)` filtering, owner scoping, and the
 * empty-statuses short-circuit (port contract: resolves 0 without
 * touching the database).
 */

const TZ = new Date("2026-06-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e8f0-${block}-7000-8000-0000000000${tail}`;
};

async function seedUser(container: TestContainer): Promise<UserId> {
  const id = nextId(0x01);
  await container.db.insert(schema.users).values({
    id,
    name: "Ingestion Count Test",
    email: `${id}@example.com`,
    emailVerified: 0,
    image: null,
    createdAt: TZ,
    updatedAt: TZ,
    username: `i-${id.slice(9, 13)}`,
    displayUsername: null,
    role: "member",
    banned: 0,
    banReason: null,
    banExpires: null,
    bio: null,
    avatarMediaId: null,
  });
  return id as UserId;
}

async function seedJob(
  container: TestContainer,
  ownerId: UserId,
  status: IngestionStatus,
): Promise<string> {
  const id = nextId(0x02);
  await container.db.insert(schema.ingestionJobs).values({
    id,
    ownerId,
    originalFileName: `${status}.md`,
    mimeType: "text/markdown",
    byteSize: 16,
    kind: "markdown",
    status,
    tempStorageKey: null,
    structurePromptOverride: null,
    metadataPromptOverride: null,
    previewJson: null,
    errorCode: null,
    errorReason: null,
    regenerationCount: 0,
    savedAsNoteId: null,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

const ACTIVE: readonly IngestionStatus[] = [
  "pending",
  "processing",
  "previewing",
];

describe("D1IngestionJobRepository.countByOwner (integration)", () => {
  it("counts only rows whose status is in the given set", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedJob(container, owner, "pending");
    await seedJob(container, owner, "processing");
    await seedJob(container, owner, "previewing");
    await seedJob(container, owner, "saved");
    await seedJob(container, owner, "failed");
    await seedJob(container, owner, "discarded");

    const count = await container.unitOfWorkProvider.run(
      async ({ ingestionJobRepository }) =>
        ingestionJobRepository.countByOwner(owner, { statuses: ACTIVE }),
    );
    expect(count).toBe(3);
  });

  it("does not count another owner's jobs", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    const other = await seedUser(container);
    await seedJob(container, other, "pending");
    await seedJob(container, other, "previewing");
    await seedJob(container, owner, "pending");

    const count = await container.unitOfWorkProvider.run(
      async ({ ingestionJobRepository }) =>
        ingestionJobRepository.countByOwner(owner, { statuses: ACTIVE }),
    );
    expect(count).toBe(1);
  });

  it("resolves 0 for an empty statuses array without querying", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedJob(container, owner, "pending");

    const count = await container.unitOfWorkProvider.run(
      async ({ ingestionJobRepository }) =>
        ingestionJobRepository.countByOwner(owner, { statuses: [] }),
    );
    expect(count).toBe(0);
  });

  it("returns 0 when the owner has no matching jobs", async () => {
    const container = createTestContainer();
    const owner = await seedUser(container);
    await seedJob(container, owner, "saved");

    const count = await container.unitOfWorkProvider.run(
      async ({ ingestionJobRepository }) =>
        ingestionJobRepository.countByOwner(owner, { statuses: ACTIVE }),
    );
    expect(count).toBe(0);
  });
});
