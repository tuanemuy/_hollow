import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "../../__tests__/helpers";
import { countActiveIngestionJobs } from "../countActiveIngestionJobs";

const TZ = new Date("2026-06-01T00:00:00.000Z").toISOString();

let userSeq = 0;
async function seedUser(container: TestContainer): Promise<string> {
  userSeq += 1;
  const suffix = userSeq.toString(16).padStart(12, "0");
  const id = `019d0002-0000-7000-8000-${suffix}`;
  await container.db.insert(schema.users).values({
    id,
    name: `count-user-${suffix}`,
    email: `count-${suffix}@example.test`,
    emailVerified: 1,
    username: `count_${suffix}`,
    role: "member",
    banned: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

let jobSeq = 0;
async function seedJob(
  container: TestContainer,
  ownerId: string,
  status: string,
): Promise<void> {
  jobSeq += 1;
  const id = `019df002-0000-7000-8000-${jobSeq.toString(16).padStart(12, "0")}`;
  await container.db.insert(schema.ingestionJobs).values({
    id,
    ownerId,
    originalFileName: `${status}.md`,
    mimeType: "text/markdown",
    byteSize: 16,
    kind: "markdown",
    status,
    regenerationCount: 0,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
}

describe("countActiveIngestionJobs", () => {
  const setup = setupTestContainer();

  it("counts only pending / processing / previewing jobs", async () => {
    const container = setup();
    const actor = await seedUser(container);
    await seedJob(container, actor, "pending");
    await seedJob(container, actor, "processing");
    await seedJob(container, actor, "previewing");
    await seedJob(container, actor, "saved");
    await seedJob(container, actor, "failed");
    await seedJob(container, actor, "discarded");

    const { count } = await countActiveIngestionJobs({
      container,
      input: { actorUserId: actor },
    });
    expect(count).toBe(3);
  });

  it("does not count other users' jobs", async () => {
    const container = setup();
    const actor = await seedUser(container);
    const other = await seedUser(container);
    await seedJob(container, other, "pending");
    await seedJob(container, actor, "previewing");

    const { count } = await countActiveIngestionJobs({
      container,
      input: { actorUserId: actor },
    });
    expect(count).toBe(1);
  });

  it("returns 0 when the actor has no active jobs", async () => {
    const container = setup();
    const actor = await seedUser(container);
    await seedJob(container, actor, "saved");

    const { count } = await countActiveIngestionJobs({
      container,
      input: { actorUserId: actor },
    });
    expect(count).toBe(0);
  });
});
