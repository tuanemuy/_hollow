import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicLLMProvider } from "@/core/adapters/anthropic/llmProvider";
import { AnthropicOCRProvider } from "@/core/adapters/anthropic/ocrProvider";
import { AnthropicPDFExtractor } from "@/core/adapters/anthropic/pdfExtractor";
import * as schema from "@/core/adapters/d1/schema";
import { BusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import {
  type LLMMetadataInput,
  type LLMMetadataResult,
  type LLMProvider,
  LLMRateLimitError,
  type LLMStructureInput,
  type LLMStructureResult,
  LLMUnavailableError,
} from "@/core/domain/ingestion/ports/llmProvider";
import {
  type OCRExtractInput,
  OCRFailureError,
  type OCRProvider,
} from "@/core/domain/ingestion/ports/ocrProvider";
import type {
  OfficeExtractInput,
  OfficeExtractor,
  OfficeExtractResult,
} from "@/core/domain/ingestion/ports/officeExtractor";
import type {
  PDFExtractInput,
  PDFExtractor,
  PDFExtractResult,
} from "@/core/domain/ingestion/ports/pdfExtractor";
import type {
  IngestionPromptPurpose,
  PromptResolver,
} from "@/core/domain/ingestion/ports/promptResolver";
import type {
  SpeechRecognitionProvider,
  SpeechTranscribeInput,
} from "@/core/domain/ingestion/ports/speechRecognitionProvider";
import type {
  HtmlSanitizer,
  SanitizePolicy,
  SanitizeResult,
} from "@/core/domain/note/ports/htmlSanitizer";
import type { ContentHtml } from "@/core/domain/note/valueObject";
import { FakeLLMProvider } from "../../__tests__/fakes/fakeLLMProvider";
import {
  setupTestContainer,
  type TestContainer,
} from "../../__tests__/helpers";
import { runIngestionJob } from "../runIngestionJob";
import { uploadFile } from "../uploadFile";

const baseTime = new Date("2026-01-01T00:00:00.000Z");
const iso = (ms: number) => new Date(baseTime.getTime() + ms).toISOString();

let userSeq = 0;
function nextUserSuffix(): string {
  userSeq += 1;
  return userSeq.toString(16).padStart(12, "0");
}

let jobSeq = 0;
function nextJobId(): string {
  jobSeq += 1;
  return `019df100-0000-7000-8000-${jobSeq.toString(16).padStart(12, "0")}`;
}

async function seedUser(container: TestContainer): Promise<string> {
  const suffix = nextUserSuffix();
  const id = `019d0002-0000-7000-8000-${suffix}`;
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

async function seedPendingJob(
  container: TestContainer,
  params: {
    ownerId: string;
    kind: string;
    mimeType: string;
    originalFileName: string;
    bodyBytes: ArrayBuffer;
    structurePromptOverride?: string | null;
    metadataPromptOverride?: string | null;
  },
): Promise<string> {
  const id = nextJobId();
  const tempStorageKey = `${params.ownerId}/ingestion/${id}`;
  await container.tempFileStorage.put(tempStorageKey, params.bodyBytes);
  await container.db.insert(schema.ingestionJobs).values({
    id,
    ownerId: params.ownerId,
    originalFileName: params.originalFileName,
    mimeType: params.mimeType,
    byteSize: params.bodyBytes.byteLength,
    kind: params.kind,
    status: "pending",
    tempStorageKey,
    structurePromptOverride: params.structurePromptOverride ?? null,
    metadataPromptOverride: params.metadataPromptOverride ?? null,
    previewJson: null,
    errorCode: null,
    errorReason: null,
    regenerationCount: 0,
    savedAsNoteId: null,
    version: 0,
    createdAt: iso(0),
    updatedAt: iso(0),
  });
  return id;
}

let dirSeq = 0;
function nextDirId(): string {
  dirSeq += 1;
  return `019df200-0000-7000-8000-${dirSeq.toString(16).padStart(12, "0")}`;
}

/**
 * Seed a per-owner root directory plus one child directory, returning the
 * child's id and slash-joined path (root excluded). Used by the
 * directory-suggestion matching tests.
 */
async function seedDirectory(
  container: TestContainer,
  params: { ownerId: string; name: string },
): Promise<{ id: string; path: string }> {
  const rootId = nextDirId();
  const childId = nextDirId();
  await container.db.insert(schema.directories).values([
    {
      id: rootId,
      ownerId: params.ownerId,
      parentId: null,
      name: "",
      slug: "",
      depth: 0,
      version: 0,
      createdAt: iso(0),
      updatedAt: iso(0),
    },
    {
      id: childId,
      ownerId: params.ownerId,
      parentId: rootId,
      name: params.name,
      slug: params.name.toLowerCase(),
      depth: 1,
      version: 0,
      createdAt: iso(0),
      updatedAt: iso(0),
    },
  ]);
  return { id: childId, path: params.name };
}

// Seeds root → parent → child so the canonical path is multi-segment
// (`parent/child`), exercising the parentId walk-up in
// `canonicalizeDirectoryPaths` that single-level seeds never hit.
async function seedNestedDirectory(
  container: TestContainer,
  params: { ownerId: string; parent: string; child: string },
): Promise<{ childId: string; path: string }> {
  const rootId = nextDirId();
  const parentId = nextDirId();
  const childId = nextDirId();
  await container.db.insert(schema.directories).values([
    {
      id: rootId,
      ownerId: params.ownerId,
      parentId: null,
      name: "",
      slug: "",
      depth: 0,
      version: 0,
      createdAt: iso(0),
      updatedAt: iso(0),
    },
    {
      id: parentId,
      ownerId: params.ownerId,
      parentId: rootId,
      name: params.parent,
      slug: params.parent.toLowerCase(),
      depth: 1,
      version: 0,
      createdAt: iso(0),
      updatedAt: iso(0),
    },
    {
      id: childId,
      ownerId: params.ownerId,
      parentId,
      name: params.child,
      slug: params.child.toLowerCase(),
      depth: 2,
      version: 0,
      createdAt: iso(0),
      updatedAt: iso(0),
    },
  ]);
  return { childId, path: `${params.parent}/${params.child}` };
}

async function seedInstanceSettings(container: TestContainer): Promise<void> {
  const limits = {
    maxUploadBytesPerDay: 1_073_741_824,
    maxIngestionBytes: 33_554_432,
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
    registrationOpen: 1,
    registrationClosedReason: null,
    limitsJson: JSON.stringify(limits),
    version: 1,
    updatedAt: iso(0),
  });
}

function utf8(value: string): ArrayBuffer {
  const enc = new TextEncoder().encode(value);
  return enc.buffer.slice(
    enc.byteOffset,
    enc.byteOffset + enc.byteLength,
  ) as ArrayBuffer;
}

// ---------- Local provider subclasses (ADR-002) ----------

class StubOfficeOk implements OfficeExtractor {
  async extractText(_input: OfficeExtractInput): Promise<OfficeExtractResult> {
    return { text: "office body text", structureHints: [] };
  }
}

class StubPDFTextual implements PDFExtractor {
  async extract(_input: PDFExtractInput): Promise<PDFExtractResult> {
    return {
      textual: true,
      text: "pdf textual body",
      pageImages: [],
    };
  }
}

class StubPDFScanned implements PDFExtractor {
  async extract(_input: PDFExtractInput): Promise<PDFExtractResult> {
    return {
      textual: false,
      text: "",
      pageImages: [utf8("page1"), utf8("page2")],
    };
  }
}

class StubOCROk implements OCRProvider {
  async extractText(_input: OCRExtractInput): Promise<string> {
    return "ocr text";
  }
}

class StubSpeechOk implements SpeechRecognitionProvider {
  async transcribe(_input: SpeechTranscribeInput): Promise<string> {
    return "transcribed audio";
  }
}

class ThrowingLLMProvider implements LLMProvider {
  async structureToHtml(
    _input: LLMStructureInput,
  ): Promise<LLMStructureResult> {
    throw new LLMUnavailableError("llm down");
  }
  async suggestMetadata(_input: LLMMetadataInput): Promise<LLMMetadataResult> {
    throw new LLMUnavailableError("llm down");
  }
}

// Throws `LLMRateLimitError` from `suggestMetadata` (the only LLM call on
// the `html` path) so the rate-limit rollback branch (Issue #109) can be
// exercised at the usecase boundary. An optional `onBeforeThrow` hook lets
// a test mutate the job row mid-pipeline to drive the concurrent-transition
// skip branch.
class RateLimitLLMProvider implements LLMProvider {
  constructor(private readonly onBeforeThrow?: () => Promise<void>) {}
  async structureToHtml(
    _input: LLMStructureInput,
  ): Promise<LLMStructureResult> {
    throw new LLMRateLimitError("rate limited");
  }
  async suggestMetadata(_input: LLMMetadataInput): Promise<LLMMetadataResult> {
    if (this.onBeforeThrow) await this.onBeforeThrow();
    throw new LLMRateLimitError("rate limited");
  }
}

// Resolver returning a fixed sentinel per purpose so tests can assert
// whether the per-upload override (#228) or the resolver fed the LLM.
class SentinelPromptResolver implements PromptResolver {
  readonly calls: IngestionPromptPurpose[] = [];
  async resolveFor(
    _userId: Parameters<PromptResolver["resolveFor"]>[0],
    purpose: IngestionPromptPurpose,
  ): Promise<string> {
    this.calls.push(purpose);
    return `RESOLVED:${purpose}`;
  }
}

class ThrowingOCRProvider implements OCRProvider {
  async extractText(_input: OCRExtractInput): Promise<string> {
    throw new OCRFailureError("ocr offline");
  }
}

class ThrowingSanitizer implements HtmlSanitizer {
  sanitize(_raw: string, _policy: SanitizePolicy): SanitizeResult {
    throw new BusinessRuleError("sanitize_failure", "sanitizer rejected body");
  }
  toPlainText(html: ContentHtml): string {
    return html as string;
  }
}

describe("runIngestionJob", () => {
  // spec: spec/testcases/ingestion/index.md#RunIngestionJob
  const getContainer = setupTestContainer();

  it("sanitises an HTML body and transitions the job to previewing", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "html",
      mimeType: "text/html",
      originalFileName: "doc.html",
      bodyBytes: utf8("<p>hello html</p>"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("previewing");
    expect(rows[0]?.errorCode).toBeNull();
    expect(rows[0]?.previewJson).not.toBeNull();
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      contentHtml: string;
    };
    expect(preview.contentHtml.length).toBeGreaterThan(0);
  });

  it("converts Markdown to HTML, sanitises it, and transitions to previewing", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "markdown",
      mimeType: "text/markdown",
      originalFileName: "doc.md",
      bodyBytes: utf8("# Heading\n\nbody"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("previewing");
    expect(rows[0]?.errorCode).toBeNull();
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      contentHtml: string;
    };
    expect(preview.contentHtml).toContain("<h1>");
  });

  it("runs office extraction → LLM structuring → sanitiser for an Office (docx) upload", async () => {
    const baseContainer = getContainer();
    const container: TestContainer = {
      ...baseContainer,
      officeExtractor: new StubOfficeOk(),
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "office",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalFileName: "doc.docx",
      bodyBytes: utf8("docx-binary"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("previewing");
    expect(rows[0]?.errorCode).toBeNull();
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      contentHtml: string;
    };
    // FakeLLMProvider default emits <p>fake structured</p>.
    expect(preview.contentHtml).toContain("fake structured");
  });

  it("uses PDF text extraction → LLM → sanitiser for a textual PDF", async () => {
    const baseContainer = getContainer();
    const container: TestContainer = {
      ...baseContainer,
      pdfExtractor: new StubPDFTextual(),
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "pdfTextual",
      mimeType: "application/pdf",
      originalFileName: "doc.pdf",
      bodyBytes: utf8("%PDF-fake"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("previewing");
    expect(rows[0]?.errorCode).toBeNull();
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      contentHtml: string;
    };
    expect(preview.contentHtml).toContain("fake structured");
  });

  it("falls through PDF text extraction → OCR per page → LLM → sanitiser for a scanned PDF", async () => {
    const baseContainer = getContainer();
    const container: TestContainer = {
      ...baseContainer,
      pdfExtractor: new StubPDFScanned(),
      ocrProvider: new StubOCROk(),
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    // The kind field is what drives the pipeline branch — declaring
    // `pdfScanned` ensures the OCR path runs unconditionally even though
    // upload-time detection would have classified the same MIME as
    // `pdfTextual`.
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "pdfScanned",
      mimeType: "application/pdf",
      originalFileName: "scan.pdf",
      bodyBytes: utf8("%PDF-scan"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("previewing");
    expect(rows[0]?.errorCode).toBeNull();
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      contentHtml: string;
    };
    expect(preview.contentHtml).toContain("fake structured");
  });

  it("runs OCR → LLM → sanitiser for an image upload", async () => {
    const baseContainer = getContainer();
    const container: TestContainer = {
      ...baseContainer,
      ocrProvider: new StubOCROk(),
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "image",
      mimeType: "image/png",
      originalFileName: "diagram.png",
      bodyBytes: utf8("png-bytes"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("previewing");
    expect(rows[0]?.errorCode).toBeNull();
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      contentHtml: string;
    };
    expect(preview.contentHtml).toContain("fake structured");
  });

  it("runs speech recognition → LLM → sanitiser for an audio upload", async () => {
    const baseContainer = getContainer();
    const container: TestContainer = {
      ...baseContainer,
      speechRecognitionProvider: new StubSpeechOk(),
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "audio",
      mimeType: "audio/mpeg",
      originalFileName: "talk.mp3",
      bodyBytes: utf8("mp3-bytes"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("previewing");
    expect(rows[0]?.errorCode).toBeNull();
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      contentHtml: string;
    };
    expect(preview.contentHtml).toContain("fake structured");
  });

  it("marks the job failed with code 'llm_failure' when the LLM throws an unavailable error", async () => {
    const baseContainer = getContainer();
    const container: TestContainer = {
      ...baseContainer,
      officeExtractor: new StubOfficeOk(),
      llmProvider: new ThrowingLLMProvider(),
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "office",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalFileName: "doc.docx",
      bodyBytes: utf8("docx"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.errorCode).toBe("llm_failure");

    const events = await container.db
      .select()
      .from(schema.outboxEvents)
      .where(eq(schema.outboxEvents.aggregateId, jobId));
    const types = events.map((e) => e.eventType);
    expect(types).toContain("ingestion.failed");
  });

  it("marks the job failed with code 'ocr_failure' when the OCR pipeline throws", async () => {
    const baseContainer = getContainer();
    const container: TestContainer = {
      ...baseContainer,
      ocrProvider: new ThrowingOCRProvider(),
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "image",
      mimeType: "image/png",
      originalFileName: "p.png",
      bodyBytes: utf8("png-bytes"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.errorCode).toBe("ocr_failure");
  });

  it("marks the job failed with code 'sanitize_failure' when the sanitiser raises BusinessRuleError", async () => {
    const baseContainer = getContainer();
    const container: TestContainer = {
      ...baseContainer,
      htmlSanitizer: new ThrowingSanitizer(),
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "html",
      mimeType: "text/html",
      originalFileName: "doc.html",
      bodyBytes: utf8("<p>x</p>"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.errorCode).toBe("sanitize_failure");
  });

  it("prefers per-upload prompt overrides over the resolver (LLM-structuring kind)", async () => {
    const baseContainer = getContainer();
    const llm = new FakeLLMProvider();
    const resolver = new SentinelPromptResolver();
    const container: TestContainer = {
      ...baseContainer,
      officeExtractor: new StubOfficeOk(),
      llmProvider: llm,
      promptResolver: resolver,
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "office",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalFileName: "doc.docx",
      bodyBytes: utf8("docx"),
      structurePromptOverride: "CUSTOM_STRUCTURE",
      metadataPromptOverride: "CUSTOM_METADATA",
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    // Override reached the LLM verbatim; the resolver was never consulted for
    // structure/metadata. title/directory have no per-upload override path, so
    // they are always resolver-resolved in the LLM-structuring branch.
    expect(llm.structureCalls[0]?.prompt).toBe("CUSTOM_STRUCTURE");
    expect(llm.structureCalls[0]?.titlePrompt).toBe("RESOLVED:title");
    expect(llm.structureCalls[0]?.directoryPrompt).toBe("RESOLVED:directory");
    expect(llm.metadataCalls[0]?.prompt).toBe("CUSTOM_METADATA");
    expect(resolver.calls).not.toContain("structure");
    expect(resolver.calls).not.toContain("metadata");
    expect(resolver.calls).toEqual(["title", "directory"]);
  });

  it("falls back to the resolver when no override is stored", async () => {
    const baseContainer = getContainer();
    const llm = new FakeLLMProvider();
    const resolver = new SentinelPromptResolver();
    const container: TestContainer = {
      ...baseContainer,
      officeExtractor: new StubOfficeOk(),
      llmProvider: llm,
      promptResolver: resolver,
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "office",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalFileName: "doc.docx",
      bodyBytes: utf8("docx"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    expect(llm.structureCalls[0]?.prompt).toBe("RESOLVED:structure");
    expect(llm.structureCalls[0]?.titlePrompt).toBe("RESOLVED:title");
    expect(llm.structureCalls[0]?.directoryPrompt).toBe("RESOLVED:directory");
    expect(llm.metadataCalls[0]?.prompt).toBe("RESOLVED:metadata");
    expect(resolver.calls).toContain("structure");
    expect(resolver.calls).toContain("title");
    expect(resolver.calls).toContain("directory");
    expect(resolver.calls).toContain("metadata");
  });

  it("keeps the same override after regenerate re-drives the pipeline", async () => {
    const baseContainer = getContainer();
    const llm = new FakeLLMProvider();
    const resolver = new SentinelPromptResolver();
    const container: TestContainer = {
      ...baseContainer,
      officeExtractor: new StubOfficeOk(),
      llmProvider: llm,
      promptResolver: resolver,
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "office",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalFileName: "doc.docx",
      bodyBytes: utf8("docx"),
      structurePromptOverride: "CUSTOM_STRUCTURE",
      metadataPromptOverride: "CUSTOM_METADATA",
    });

    // First run lands the job in previewing carrying the override.
    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    // Regenerate: return to pending (the override row is untouched — save
    // never writes the provenance columns) and re-run the pipeline.
    await container.unitOfWorkProvider.run(
      async ({ ingestionJobRepository }) => {
        const found = await ingestionJobRepository.findById(
          jobId as unknown as Parameters<
            typeof ingestionJobRepository.findById
          >[0],
        );
        if (found === null || found.entity.status !== "previewing") {
          throw new Error("expected previewing job to regenerate");
        }
        const { IngestionJob } = await import("@/core/domain/ingestion/entity");
        const transition = IngestionJob.regenerate(found.entity, new Date(), 5);
        await ingestionJobRepository.save(
          transition.entity,
          found.expectedVersion,
        );
      },
    );

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    // The second structuring call (after regenerate) still carries the
    // original structure/metadata overrides, so the resolver is never
    // consulted for those purposes. title/directory have no per-upload
    // override path, so they are always resolver-resolved in the LLM branch.
    expect(llm.structureCalls).toHaveLength(2);
    expect(llm.structureCalls[1]?.prompt).toBe("CUSTOM_STRUCTURE");
    expect(resolver.calls).not.toContain("structure");
    expect(resolver.calls).not.toContain("metadata");
    expect(resolver.calls.filter((p) => p === "title")).toHaveLength(2);
    expect(resolver.calls.filter((p) => p === "directory")).toHaveLength(2);
  });

  // ---------- Directory suggestion matching ----------

  it("passes the owner's existing directory paths to the LLM as context", async () => {
    const baseContainer = getContainer();
    const llm = new FakeLLMProvider();
    const container: TestContainer = {
      ...baseContainer,
      officeExtractor: new StubOfficeOk(),
      llmProvider: llm,
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, {
      ownerId: owner,
      name: "Work",
    });
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "office",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalFileName: "doc.docx",
      bodyBytes: utf8("docx"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    expect(llm.structureCalls[0]?.existingDirectories).toEqual([dir.path]);
  });

  it("resolves an LLM directory suggestion that matches an existing path to suggestedDirectoryId", async () => {
    const baseContainer = getContainer();
    const llm = new FakeLLMProvider();
    const container: TestContainer = {
      ...baseContainer,
      officeExtractor: new StubOfficeOk(),
      llmProvider: llm,
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, {
      ownerId: owner,
      name: "Work",
    });
    // Case + trailing slash differs from the canonical path on purpose to
    // exercise the normalisation in the matcher.
    llm.setStructureResult({
      html: "<p>x</p>",
      titleSuggestion: "T",
      directorySuggestion: "/work/",
    });
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "office",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalFileName: "doc.docx",
      bodyBytes: utf8("docx"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      suggestedDirectoryId: string | null;
      suggestedDirectoryName: string | null;
    };
    expect(preview.suggestedDirectoryId).toBe(dir.id);
    expect(preview.suggestedDirectoryName).toBeNull();
  });

  it("carries the full canonical path as a new nested directory name when the suggestion matches nothing", async () => {
    const baseContainer = getContainer();
    const llm = new FakeLLMProvider();
    const container: TestContainer = {
      ...baseContainer,
      officeExtractor: new StubOfficeOk(),
      llmProvider: llm,
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    await seedDirectory(container, { ownerId: owner, name: "Work" });
    llm.setStructureResult({
      html: "<p>x</p>",
      titleSuggestion: "T",
      // A nested path with no existing match is carried forward verbatim as
      // a new nested path for the commit to create (Issue #363).
      directorySuggestion: "Research/Papers",
    });
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "office",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalFileName: "doc.docx",
      bodyBytes: utf8("docx"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      suggestedDirectoryId: string | null;
      suggestedDirectoryName: string | null;
    };
    expect(preview.suggestedDirectoryId).toBeNull();
    expect(preview.suggestedDirectoryName).toBe("Research/Papers");
  });

  it("passes an empty existingDirectories list when the owner has no directories (empty tree)", async () => {
    const baseContainer = getContainer();
    const llm = new FakeLLMProvider();
    const container: TestContainer = {
      ...baseContainer,
      officeExtractor: new StubOfficeOk(),
      llmProvider: llm,
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    llm.setStructureResult({
      html: "<p>x</p>",
      titleSuggestion: "T",
      directorySuggestion: "Inbox",
    });
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "office",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalFileName: "doc.docx",
      bodyBytes: utf8("docx"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    expect(llm.structureCalls[0]?.existingDirectories).toEqual([]);
    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      suggestedDirectoryId: string | null;
      suggestedDirectoryName: string | null;
    };
    // No tree to match against → the suggestion becomes a new directory name.
    expect(preview.suggestedDirectoryId).toBeNull();
    expect(preview.suggestedDirectoryName).toBe("Inbox");
  });

  it("does not over-match a near-miss spelling (Worked ≠ existing Work)", async () => {
    const baseContainer = getContainer();
    const llm = new FakeLLMProvider();
    const container: TestContainer = {
      ...baseContainer,
      officeExtractor: new StubOfficeOk(),
      llmProvider: llm,
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    await seedDirectory(container, { ownerId: owner, name: "Work" });
    // "Worked" is a near-miss of the existing "Work": matching is exact
    // (after normalisation), so it must NOT resolve to the existing id —
    // it falls back to a new directory instead.
    llm.setStructureResult({
      html: "<p>x</p>",
      titleSuggestion: "T",
      directorySuggestion: "Worked",
    });
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "office",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalFileName: "doc.docx",
      bodyBytes: utf8("docx"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      suggestedDirectoryId: string | null;
      suggestedDirectoryName: string | null;
    };
    expect(preview.suggestedDirectoryId).toBeNull();
    expect(preview.suggestedDirectoryName).toBe("Worked");
  });

  it("projects a nested directory tree into multi-segment canonical paths and matches them", async () => {
    const baseContainer = getContainer();
    const llm = new FakeLLMProvider();
    const container: TestContainer = {
      ...baseContainer,
      officeExtractor: new StubOfficeOk(),
      llmProvider: llm,
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const nested = await seedNestedDirectory(container, {
      ownerId: owner,
      parent: "Work",
      child: "Reports",
    });
    // The LLM returns the multi-segment path; the canonical projection must
    // have built "Work/Reports" from the parentId chain for this to match.
    llm.setStructureResult({
      html: "<p>x</p>",
      titleSuggestion: "T",
      directorySuggestion: "Work/Reports",
    });
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "office",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalFileName: "doc.docx",
      bodyBytes: utf8("docx"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    // Both the parent ("Work") and the child ("Work/Reports") are navigable
    // placement targets, so both canonical paths are offered to the LLM.
    expect(llm.structureCalls[0]?.existingDirectories).toEqual([
      "Work",
      nested.path,
    ]);
    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      suggestedDirectoryId: string | null;
      suggestedDirectoryName: string | null;
    };
    expect(preview.suggestedDirectoryId).toBe(nested.childId);
    expect(preview.suggestedDirectoryName).toBeNull();
  });

  it("drops a path with an over-long segment instead of failing the job", async () => {
    const baseContainer = getContainer();
    const llm = new FakeLLMProvider();
    const container: TestContainer = {
      ...baseContainer,
      officeExtractor: new StubOfficeOk(),
      llmProvider: llm,
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    // No existing match → carry the path forward, but a segment exceeds the
    // `DirectoryName` length cap (80). `IngestionPreview.create` null-s the
    // whole proposal (best-effort) rather than throwing and failing the job.
    llm.setStructureResult({
      html: "<p>x</p>",
      titleSuggestion: "T",
      directorySuggestion: `ok/${"x".repeat(81)}`,
    });
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "office",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalFileName: "doc.docx",
      bodyBytes: utf8("docx"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    // The job reached the preview stage (preview persisted), not failed.
    expect(rows[0]?.status).toBe("previewing");
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      suggestedDirectoryId: string | null;
      suggestedDirectoryName: string | null;
    };
    expect(preview.suggestedDirectoryId).toBeNull();
    expect(preview.suggestedDirectoryName).toBeNull();
  });

  it("drops a path deeper than MAX_DIRECTORY_DEPTH instead of failing the job", async () => {
    const baseContainer = getContainer();
    const llm = new FakeLLMProvider();
    const container: TestContainer = {
      ...baseContainer,
      officeExtractor: new StubOfficeOk(),
      llmProvider: llm,
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    llm.setStructureResult({
      html: "<p>x</p>",
      titleSuggestion: "T",
      directorySuggestion: Array.from({ length: 11 }, (_, i) => `d${i}`).join(
        "/",
      ),
    });
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "office",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      originalFileName: "doc.docx",
      bodyBytes: utf8("docx"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("previewing");
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      suggestedDirectoryId: string | null;
      suggestedDirectoryName: string | null;
    };
    expect(preview.suggestedDirectoryId).toBeNull();
    expect(preview.suggestedDirectoryName).toBeNull();
  });
});

describe("runIngestionJob (real Anthropic adapters with fake fetch)", () => {
  // End-to-end smoke for the real Anthropic OCR / PDF / LLM adapters
  // wired together through `runIngestionJob`. The Anthropic Messages
  // API is mocked via `vi.stubGlobal('fetch', ...)`; we never hit the
  // network. Each test installs its own mock and the `afterEach` hook
  // restores the global so adjacent suites are unaffected.
  const getContainer = setupTestContainer();

  afterEach(() => {
    vi.unstubAllGlobals();
    // The rate-limit rollback tests spy on the shared `ConsoleLogger`
    // singleton and the per-test UoW provider — restore so spies do not
    // leak across tests.
    vi.restoreAllMocks();
  });

  function structureEnvelope(html: string): unknown {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            html,
            titleSuggestion: "Generated title",
            directorySuggestion: null,
          }),
        },
      ],
    };
  }

  function metadataEnvelope(): unknown {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ tags: [], aliases: [] }),
        },
      ],
    };
  }

  function textEnvelope(text: string): unknown {
    return {
      content: [{ type: "text", text }],
    };
  }

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }

  it("runs Anthropic OCR → Anthropic LLM structuring → sanitiser for an image upload", async () => {
    // Three sequential Anthropic POSTs: OCR extract, structureToHtml,
    // suggestMetadata. The mock returns each in order regardless of
    // request body (the adapters route to the same endpoint URL).
    // Order matches the pipeline call sequence for `image` kind:
    // ocr.extractText → llm.structureToHtml → llm.suggestMetadata.
    // If the pipeline order changes, update this array.
    const responses: unknown[] = [
      textEnvelope("captured text from image"),
      structureEnvelope("<p>structured from ocr</p>"),
      metadataEnvelope(),
    ];
    const fetchMock = vi.fn(async () => {
      const next = responses.shift();
      if (next === undefined) {
        throw new Error("fetch called more times than expected");
      }
      return jsonResponse(200, next);
    });
    vi.stubGlobal("fetch", fetchMock);

    const baseContainer = getContainer();
    const container: TestContainer = {
      ...baseContainer,
      ocrProvider: new AnthropicOCRProvider({
        apiKey: "sk-ant-test",
        model: "claude-3-5-sonnet-latest",
      }),
      llmProvider: new AnthropicLLMProvider({
        apiKey: "sk-ant-test",
        model: "claude-3-5-sonnet-latest",
      }),
    };

    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "image",
      mimeType: "image/png",
      originalFileName: "diagram.png",
      bodyBytes: utf8("png-bytes"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("previewing");
    expect(rows[0]?.errorCode).toBeNull();
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      contentHtml: string;
    };
    expect(preview.contentHtml).toContain("structured from ocr");
    // All three Anthropic round-trips consumed; the OCR adapter is the
    // first call so we verify its content-block shape pointedly.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstCall = fetchMock.mock.calls[0] as unknown as [
      unknown,
      RequestInit,
    ];
    const firstBody = JSON.parse(firstCall[1].body as string);
    expect(firstBody.messages[0].content[0]).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/png" },
    });
  });

  it("runs Anthropic PDF extraction → Anthropic LLM structuring → sanitiser for a textual PDF", async () => {
    // Order matches the pipeline call sequence for `pdfTextual` kind:
    // pdf.extract → llm.structureToHtml → llm.suggestMetadata.
    // If the pipeline order changes, update this array.
    const responses: unknown[] = [
      textEnvelope("extracted PDF body text"),
      structureEnvelope("<p>structured from pdf</p>"),
      metadataEnvelope(),
    ];
    const fetchMock = vi.fn(async () => {
      const next = responses.shift();
      if (next === undefined) {
        throw new Error("fetch called more times than expected");
      }
      return jsonResponse(200, next);
    });
    vi.stubGlobal("fetch", fetchMock);

    const baseContainer = getContainer();
    const container: TestContainer = {
      ...baseContainer,
      pdfExtractor: new AnthropicPDFExtractor({
        apiKey: "sk-ant-test",
        model: "claude-3-5-sonnet-latest",
      }),
      llmProvider: new AnthropicLLMProvider({
        apiKey: "sk-ant-test",
        model: "claude-3-5-sonnet-latest",
      }),
    };

    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "pdfTextual",
      mimeType: "application/pdf",
      originalFileName: "doc.pdf",
      bodyBytes: utf8("%PDF-fake"),
    });

    await runIngestionJob({
      container,
      input: { jobId: jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("previewing");
    expect(rows[0]?.errorCode).toBeNull();
    const preview = JSON.parse(rows[0]?.previewJson ?? "{}") as {
      contentHtml: string;
    };
    expect(preview.contentHtml).toContain("structured from pdf");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstCall = fetchMock.mock.calls[0] as unknown as [
      unknown,
      RequestInit,
    ];
    const firstBody = JSON.parse(firstCall[1].body as string);
    expect(firstBody.messages[0].content[0]).toMatchObject({
      type: "document",
      source: { type: "base64", media_type: "application/pdf" },
    });
  });
});

describe("uploadFile → runIngestionJob (MIME spoof connector)", () => {
  // spec: spec/testcases/ingestion/index.md#UploadFile (MIME 偽装) — the
  // upload succeeds because detection trusts the declared MIME, but the
  // pipeline trips on the underlying content kind. With the default
  // StubPDFExtractor the spoofed PDF upload propagates the unsupported-
  // format BusinessRuleError into `markFailed`.
  const getContainer = setupTestContainer();

  it("marks the job failed with the PDF stub's unsupported-format code when a PDF mime is claimed", async () => {
    const container = getContainer();
    await seedInstanceSettings(container);
    const owner = await seedUser(container);

    const body = utf8("not really a pdf");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(body));
        controller.close();
      },
    });

    const { jobId } = await uploadFile({
      container,
      input: {
        actorUserId: owner,
        originalFileName: "spoof.pdf",
        mimeType: "application/pdf",
        byteSize: body.byteLength,
        bodyStream: stream,
      },
    });

    await runIngestionJob({
      container,
      input: { jobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("failed");
    // The stub PDF extractor throws BusinessRuleError(UnsupportedFormat),
    // which classifyPipelineError surfaces verbatim as the markFailed
    // code (`INGESTION_UNSUPPORTED_FORMAT`).
    expect(rows[0]?.errorCode).toBe(IngestionErrorCode.UnsupportedFormat);
  });

  // ---------- LLMRateLimitError rollback (Issue #109) ----------

  it("rolls processing → pending and rethrows when the LLM raises LLMRateLimitError", async () => {
    const baseContainer = getContainer();
    const container: TestContainer = {
      ...baseContainer,
      llmProvider: new RateLimitLLMProvider(),
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "html",
      mimeType: "text/html",
      originalFileName: "doc.html",
      bodyBytes: utf8("<p>hello</p>"),
    });

    // The usecase must rethrow so the queue consumer classifies the
    // dispatch as `retry` and re-delivers.
    await expect(
      runIngestionJob({
        container,
        input: { jobId: jobId },
      }),
    ).rejects.toBeInstanceOf(LLMRateLimitError);

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    // Back in `pending` (not `processing`), so the redelivery passes the
    // `isPending` guard and re-drives the pipeline. seed=0 → promote=1 →
    // rollback=2.
    expect(rows[0]?.status).toBe("pending");
    expect(rows[0]?.version).toBe(2);
    expect(rows[0]?.errorCode).toBeNull();
    expect(rows[0]?.tempStorageKey).not.toBeNull();
  });

  it("skips the rollback (and still rethrows) when the job already left processing", async () => {
    const baseContainer = getContainer();
    const jobIdHolder: { id: string | null } = { id: null };
    const container: TestContainer = {
      ...baseContainer,
      // Concurrently move the row off `processing` (raw discard) before the
      // rate-limit throw, so the rollback's `isProcessing` re-check skips.
      llmProvider: new RateLimitLLMProvider(async () => {
        if (jobIdHolder.id === null) return;
        await baseContainer.db
          .update(schema.ingestionJobs)
          .set({ status: "discarded", version: 9 })
          .where(eq(schema.ingestionJobs.id, jobIdHolder.id));
      }),
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "html",
      mimeType: "text/html",
      originalFileName: "doc.html",
      bodyBytes: utf8("<p>hello</p>"),
    });
    jobIdHolder.id = jobId;

    await expect(
      runIngestionJob({
        container,
        input: { jobId: jobId },
      }),
    ).rejects.toBeInstanceOf(LLMRateLimitError);

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    // Untouched by the rollback: still `discarded` at the version the
    // concurrent writer left, proving the `isProcessing` guard skipped.
    expect(rows[0]?.status).toBe("discarded");
    expect(rows[0]?.version).toBe(9);
  });

  it("logs a warning and still rethrows when the rollback save fails", async () => {
    const baseContainer = getContainer();
    const container: TestContainer = {
      ...baseContainer,
      llmProvider: new RateLimitLLMProvider(),
    };
    await seedInstanceSettings(container);
    const owner = await seedUser(container);
    const jobId = await seedPendingJob(container, {
      ownerId: owner,
      kind: "html",
      mimeType: "text/html",
      originalFileName: "doc.html",
      bodyBytes: utf8("<p>hello</p>"),
    });

    // run #1 promotes pending → processing; run #2 is the directory-tree
    // fetch; the pipeline then throws the rate-limit error; run #3 is the
    // rollback — force it to reject so the catch's logger.warn + rethrow
    // path is exercised.
    const originalRun = baseContainer.unitOfWorkProvider.run.bind(
      baseContainer.unitOfWorkProvider,
    );
    let runCalls = 0;
    vi.spyOn(container.unitOfWorkProvider, "run").mockImplementation((fn) => {
      runCalls += 1;
      if (runCalls === 3) return Promise.reject(new Error("d1 boom"));
      return originalRun(fn);
    });
    const warnSpy = vi.spyOn(container.logger, "warn");

    await expect(
      runIngestionJob({
        container,
        input: { jobId: jobId },
      }),
    ).rejects.toBeInstanceOf(LLMRateLimitError);

    expect(warnSpy).toHaveBeenCalledWith(
      "ingestion.rateLimitRollback.persistence_failed",
      expect.objectContaining({ jobId }),
    );
    // The rollback never committed, so the row is still `processing`; the
    // next redelivery re-attempts the rollback (ADR-001 two-stage
    // convergence).
    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("processing");
  });
});
