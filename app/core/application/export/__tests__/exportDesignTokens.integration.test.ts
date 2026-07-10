import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import { updateDesignTokens } from "../../adminSettings/updateDesignTokens";
import { runExportJob } from "../runExportJob";
import { startExportJob } from "../startExportJob";

const TZ = new Date("2026-01-01T00:00:00.000Z").toISOString();

let seq = 0;
function nextId(prefix: number): string {
  seq += 1;
  const block = seq.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `019d0401-${block}-7000-8000-0000000000${tail}`;
}

beforeEach(() => {
  seq = 0;
});

async function seedUser(
  container: TestContainer,
  role: "admin" | "member" = "admin",
): Promise<string> {
  const id = nextId(0x01);
  await container.db.insert(schema.users).values({
    id,
    name: "Tester",
    email: `${id}@example.com`,
    emailVerified: 1,
    username: `u-${id.slice(9, 13)}`,
    role,
    banned: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

async function seedDirectory(
  container: TestContainer,
  ownerId: string,
): Promise<string> {
  const id = nextId(0x02);
  await container.db.insert(schema.directories).values({
    id,
    ownerId,
    parentId: null,
    name: "root",
    slug: `d-${id.slice(9, 13)}`,
    depth: 0,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

async function seedNote(
  container: TestContainer,
  ownerId: string,
  directoryId: string,
): Promise<string> {
  const id = nextId(0x03);
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: "seed",
    contentHtml: "<p>seed</p>",
    frontMatterJson: "{}",
    status: "active",
    trashedAt: null,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

async function seedHtmlExportJob(
  container: TestContainer,
  ownerId: string,
  noteId: string,
): Promise<string> {
  const id = nextId(0x04);
  await container.db.insert(schema.exportJobs).values({
    id,
    ownerId,
    format: "html",
    scope: "single",
    targetNoteIdsJson: JSON.stringify([noteId]),
    viewQueryJson: null,
    optionsJson: JSON.stringify({
      includeFrontMatter: false,
      embedMedia: false,
      pdfPaperSize: null,
    }),
    status: "pending",
    artifactKey: null,
    artifactSize: null,
    errorCode: null,
    errorReason: null,
    progressProcessed: 0,
    progressTotal: 0,
    failedNoteIdsJson: "[]",
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
    completedAt: null,
    expiresAt: null,
  });
  return id;
}

const decode = (bytes: ArrayBuffer): string => new TextDecoder().decode(bytes);

describe("export design tokens (integration)", () => {
  const getContainer = setupTestContainer();

  it("AC-2: saved override is injected into startExportJob(html) :root with the correct key", async () => {
    const container = getContainer();
    const admin = await seedUser(container, "admin");
    const dir = await seedDirectory(container, admin);
    const noteId = await seedNote(container, admin, dir);

    await updateDesignTokens({
      container,
      input: {
        actorUserId: admin,
        tokens: { "--color-accent": "#ff0000" },
      },
    });

    const { artifact } = await startExportJob({
      container,
      input: {
        actorUserId: admin,
        format: "html",
        targetNoteId: noteId,
        options: {
          includeFrontMatter: false,
          embedMedia: false,
          pdfPaperSize: null,
        },
      },
    });

    const html = decode(artifact.bytes);
    expect(html).toContain(":root {");
    expect(html).toContain("--color-accent: #ff0000;");
    expect(html).not.toContain("----color-accent");
  });

  it("AC-4: built-in defaults are injected when there is no override", async () => {
    const container = getContainer();
    const admin = await seedUser(container, "admin");
    const dir = await seedDirectory(container, admin);
    const noteId = await seedNote(container, admin, dir);

    const { artifact } = await startExportJob({
      container,
      input: {
        actorUserId: admin,
        format: "html",
        targetNoteId: noteId,
        options: {
          includeFrontMatter: false,
          embedMedia: false,
          pdfPaperSize: null,
        },
      },
    });

    const html = decode(artifact.bytes);
    // Built-in accent default from BUILTIN_DESIGN_TOKENS, correct key.
    expect(html).toContain("--color-accent: oklch(37.1% 0 0);");
    expect(html).not.toContain("----color-accent");
  });

  it("AC-3: saved override is reflected in the runExportJob(html) artifact read back from object storage", async () => {
    const container = getContainer();
    const admin = await seedUser(container, "admin");
    const dir = await seedDirectory(container, admin);
    const noteId = await seedNote(container, admin, dir);
    const jobId = await seedHtmlExportJob(container, admin, noteId);

    await updateDesignTokens({
      container,
      input: {
        actorUserId: admin,
        tokens: { "--color-accent": "#ff0000" },
      },
    });

    const { job } = await runExportJob({
      container,
      input: { jobId },
    });
    expect(job?.status).toBe("completed");

    const rows = await container.db
      .select()
      .from(schema.exportJobs)
      .where(eq(schema.exportJobs.id, jobId));
    const artifactKey = rows[0]?.artifactKey;
    expect(artifactKey).not.toBeNull();
    if (!artifactKey) throw new Error("artifactKey missing after completion");

    const stored = await container.objectStorage.get(artifactKey);
    const html = decode(stored);
    expect(html).toContain(":root {");
    expect(html).toContain("--color-accent: #ff0000;");
    expect(html).not.toContain("----color-accent");
  });
});
