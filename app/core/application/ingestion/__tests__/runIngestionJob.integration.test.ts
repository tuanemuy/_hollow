import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import { AnthropicLLMProvider } from "@/core/adapters/llm/llmProvider";
import { AnthropicOCRProvider } from "@/core/adapters/llm/ocrProvider";
import { AnthropicPDFExtractor } from "@/core/adapters/llm/pdfExtractor";
import { BusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import {
  type LLMMetadataInput,
  type LLMMetadataResult,
  type LLMProvider,
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
  SpeechRecognitionProvider,
  SpeechTranscribeInput,
} from "@/core/domain/ingestion/ports/speechRecognitionProvider";
import type {
  HtmlSanitizer,
  SanitizePolicy,
  SanitizeResult,
} from "@/core/domain/note/ports/htmlSanitizer";
import type { ContentHtml } from "@/core/domain/note/valueObject";
import {
  setupTestContainer,
  type TestContainer,
} from "../../__tests__/helpers";
import type { UserId } from "../../dto/identity";
import type { IngestionJobId } from "../../dto/ingestion";
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

async function seedUser(container: TestContainer): Promise<UserId> {
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
  return id as UserId;
}

async function seedPendingJob(
  container: TestContainer,
  params: {
    ownerId: UserId;
    kind: string;
    mimeType: string;
    originalFileName: string;
    bodyBytes: ArrayBuffer;
  },
): Promise<string> {
  const id = nextJobId();
  const tempStorageKey = `${params.ownerId}/ingestion/${id}`;
  await container.tempFileStorage.put(tempStorageKey, params.bodyBytes);
  await container.db.insert(schema.ingestionJobs).values({
    id,
    ownerId: params.ownerId as unknown as string,
    originalFileName: params.originalFileName,
    mimeType: params.mimeType,
    byteSize: params.bodyBytes.byteLength,
    kind: params.kind,
    status: "pending",
    tempStorageKey,
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
      input: { jobId: jobId as unknown as IngestionJobId },
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
      input: { jobId: jobId as unknown as IngestionJobId },
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
      input: { jobId: jobId as unknown as IngestionJobId },
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
      input: { jobId: jobId as unknown as IngestionJobId },
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
      input: { jobId: jobId as unknown as IngestionJobId },
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
      input: { jobId: jobId as unknown as IngestionJobId },
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
      input: { jobId: jobId as unknown as IngestionJobId },
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
      input: { jobId: jobId as unknown as IngestionJobId },
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
      input: { jobId: jobId as unknown as IngestionJobId },
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
      input: { jobId: jobId as unknown as IngestionJobId },
    });

    const rows = await container.db
      .select()
      .from(schema.ingestionJobs)
      .where(eq(schema.ingestionJobs.id, jobId));
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.errorCode).toBe("sanitize_failure");
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
      input: { jobId: jobId as unknown as IngestionJobId },
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
      input: { jobId: jobId as unknown as IngestionJobId },
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
      .where(eq(schema.ingestionJobs.id, jobId as unknown as string));
    expect(rows[0]?.status).toBe("failed");
    // The stub PDF extractor throws BusinessRuleError(UnsupportedFormat),
    // which classifyPipelineError surfaces verbatim as the markFailed
    // code (`INGESTION_UNSUPPORTED_FORMAT`).
    expect(rows[0]?.errorCode).toBe(IngestionErrorCode.UnsupportedFormat);
  });
});
