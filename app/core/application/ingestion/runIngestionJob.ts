import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { isBusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { IngestionJob } from "@/core/domain/ingestion/entity";
import {
  isLLMRateLimitError,
  isLLMTimeoutError,
  isLLMUnavailableError,
  type LLMProvider,
} from "@/core/domain/ingestion/ports/llmProvider";
import {
  isOCRFailureError,
  type OCRProvider,
} from "@/core/domain/ingestion/ports/ocrProvider";
import {
  isOfficeParseError,
  type OfficeExtractor,
} from "@/core/domain/ingestion/ports/officeExtractor";
import {
  isPDFParseError,
  type PDFExtractor,
} from "@/core/domain/ingestion/ports/pdfExtractor";
import type {
  IngestionPromptPurpose,
  PromptResolver,
} from "@/core/domain/ingestion/ports/promptResolver";
import {
  isSpeechFailureError,
  type SpeechRecognitionProvider,
} from "@/core/domain/ingestion/ports/speechRecognitionProvider";
import {
  type IngestionJobId as IngestionJobIdBrand,
  IngestionPreview,
  type SourceFileKind,
} from "@/core/domain/ingestion/valueObject";
import type { HtmlSanitizer } from "@/core/domain/note/ports/htmlSanitizer";
import {
  ContentHtml,
  FrontMatter,
  type InternalLinkRef,
  NoteTitle,
} from "@/core/domain/note/valueObject";
import { TagName } from "@/core/domain/tag/valueObject";
import type { IngestionJobId } from "../dto/ingestion";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type RunIngestionJobInput = Readonly<{
  jobId: IngestionJobId;
}>;

export async function runIngestionJob({
  container,
  input,
}: ServiceArgs<RunIngestionJobInput>): Promise<void> {
  const now0 = container.clock.now();

  const promoted = await container.unitOfWorkProvider.run(
    async ({ ingestionJobRepository, collectEvents }) => {
      const found = await ingestionJobRepository.findById(
        input.jobId as unknown as IngestionJobIdBrand,
      );
      if (found === null) {
        throw new NotFoundError(
          "INGESTION_JOB_NOT_FOUND",
          `Ingestion job not found: ${input.jobId}`,
        );
      }
      if (!IngestionJob.isPending(found.entity)) {
        return null;
      }
      const transition = IngestionJob.startProcessing(found.entity, now0);
      await ingestionJobRepository.save(
        transition.entity,
        found.expectedVersion,
      );
      collectEvents(transition.eventDrafts);
      return transition.entity;
    },
  );

  if (promoted === null) return;

  const tempStorageKey = promoted.tempStorageKey;
  if (tempStorageKey === null) {
    await markFailedSafely(container, input.jobId, "ingestion.invalid_state", {
      message: "Processing job has no tempStorageKey",
    });
    return;
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await container.tempFileStorage.get(tempStorageKey as string);
  } catch (cause) {
    await markFailedSafely(container, input.jobId, "ingestion.temp_storage", {
      cause,
      message: "Failed to retrieve staged upload",
    });
    return;
  }

  try {
    const preview = await runPipeline({
      bytes,
      kind: promoted.kind,
      ownerId: promoted.ownerId,
      llm: container.llmProvider,
      ocr: container.ocrProvider,
      speech: container.speechRecognitionProvider,
      office: container.officeExtractor,
      pdf: container.pdfExtractor,
      sanitizer: container.htmlSanitizer,
      markdown: container.markdownConverter,
      promptResolver: container.promptResolver,
      mimeType: promoted.mimeType,
      originalFileName: promoted.originalFileName,
    });

    const nowAttach = container.clock.now();
    await container.unitOfWorkProvider.run(
      async ({ ingestionJobRepository, collectEvents }) => {
        const found = await ingestionJobRepository.findById(
          input.jobId as unknown as IngestionJobIdBrand,
        );
        if (found === null) {
          throw new NotFoundError(
            "INGESTION_JOB_NOT_FOUND",
            `Ingestion job not found: ${input.jobId}`,
          );
        }
        if (!IngestionJob.isProcessing(found.entity)) {
          // Concurrent transition (discard / fail) — bow out without
          // overwriting the new state.
          return;
        }
        const transition = IngestionJob.attachPreview(
          found.entity,
          preview,
          nowAttach,
        );
        await ingestionJobRepository.save(
          transition.entity,
          found.expectedVersion,
        );
        collectEvents(transition.eventDrafts);
      },
    );
  } catch (error) {
    if (isLLMRateLimitError(error)) {
      // Surface so the queue consumer can re-deliver with backoff.
      throw error;
    }
    const code = classifyPipelineError(error);
    await markFailedSafely(container, input.jobId, code, {
      cause: error,
    });
  }
}

type PipelineDeps = Readonly<{
  bytes: ArrayBuffer;
  kind: SourceFileKind;
  ownerId: UserId;
  llm: LLMProvider;
  ocr: OCRProvider;
  speech: SpeechRecognitionProvider;
  office: OfficeExtractor;
  pdf: PDFExtractor;
  sanitizer: HtmlSanitizer;
  markdown: { toHtml(markdown: string): Promise<string> };
  promptResolver: PromptResolver;
  mimeType: string;
  originalFileName: string;
}>;

async function runPipeline(deps: PipelineDeps): Promise<IngestionPreview> {
  const { kind } = deps;
  const text = await extractText(deps);
  const structurePrompt = await deps.promptResolver.resolveFor(
    deps.ownerId,
    "structure" satisfies IngestionPromptPurpose,
  );
  let html: string;
  let titleSuggestion: string;
  let directorySuggestion: string | null;

  if (kind === "html") {
    const sanitized = deps.sanitizer.sanitize(text, {
      allowMedia: true,
      allowInternalLinks: true,
    });
    html = sanitized.html as string;
    titleSuggestion = fallbackTitle(deps.originalFileName);
    directorySuggestion = null;
  } else if (kind === "markdown") {
    const raw = await deps.markdown.toHtml(text);
    const sanitized = deps.sanitizer.sanitize(raw, {
      allowMedia: true,
      allowInternalLinks: true,
    });
    html = sanitized.html as string;
    titleSuggestion = fallbackTitle(deps.originalFileName);
    directorySuggestion = null;
  } else {
    const structured = await deps.llm.structureToHtml({
      rawText: text,
      prompt: structurePrompt,
      locale: "ja",
    });
    const sanitized = deps.sanitizer.sanitize(structured.html, {
      allowMedia: true,
      allowInternalLinks: true,
    });
    html = sanitized.html as string;
    titleSuggestion = structured.titleSuggestion;
    directorySuggestion = structured.directorySuggestion;
  }

  const metadataPrompt = await deps.promptResolver.resolveFor(
    deps.ownerId,
    "metadata" satisfies IngestionPromptPurpose,
  );
  const metadata = await deps.llm.suggestMetadata({
    html,
    prompt: metadataPrompt,
  });

  const tagNames: TagName[] = [];
  for (const raw of metadata.tags) {
    try {
      tagNames.push(TagName.create(raw));
    } catch {
      // Best-effort: drop tokens that fail VO validation rather than
      // failing the entire ingestion job.
    }
  }

  return IngestionPreview.create({
    title: NoteTitle.create(
      titleSuggestion.trim().length > 0
        ? titleSuggestion
        : fallbackTitle(deps.originalFileName),
    ),
    contentHtml: ContentHtml.create(html),
    suggestedDirectoryId: null as DirectoryId | null,
    suggestedDirectoryName:
      directorySuggestion === null
        ? null
        : directorySuggestion.trim().length === 0
          ? null
          : directorySuggestion,
    frontMatter: FrontMatter.empty(),
    suggestedTagNames: tagNames,
    internalLinkRefs: [] as readonly InternalLinkRef[],
    mediaRefs: [],
  });
}

async function extractText(deps: PipelineDeps): Promise<string> {
  switch (deps.kind) {
    case "html":
    case "markdown":
    case "plain":
      return arrayBufferToUtf8(deps.bytes);
    case "office": {
      const result = await deps.office.extractText({
        bytes: deps.bytes,
        mime: deps.mimeType,
      });
      return result.text;
    }
    case "pdfTextual": {
      const result = await deps.pdf.extract({ bytes: deps.bytes });
      if (result.textual && result.text.trim().length > 0) {
        return result.text;
      }
      // Downgrade detection: pages came back without extractable text.
      const ocrChunks = await Promise.all(
        result.pageImages.map((page) =>
          deps.ocr.extractText({ imageBytes: page, mime: "image/png" }),
        ),
      );
      return ocrChunks.join("\n\n");
    }
    case "pdfScanned": {
      const result = await deps.pdf.extract({ bytes: deps.bytes });
      const ocrChunks = await Promise.all(
        result.pageImages.map((page) =>
          deps.ocr.extractText({ imageBytes: page, mime: "image/png" }),
        ),
      );
      return ocrChunks.join("\n\n");
    }
    case "image":
      return deps.ocr.extractText({
        imageBytes: deps.bytes,
        mime: deps.mimeType,
      });
    case "audio":
      return deps.speech.transcribe({
        audioBytes: deps.bytes,
        mime: deps.mimeType,
        locale: "ja",
      });
  }
}

function fallbackTitle(originalFileName: string): string {
  const stripped = originalFileName.replace(/\.[^./\\]+$/u, "").trim();
  if (stripped.length === 0) return "Untitled";
  return stripped.slice(0, 200);
}

function arrayBufferToUtf8(buffer: ArrayBuffer): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
}

function classifyPipelineError(error: unknown): string {
  if (isLLMUnavailableError(error) || isLLMTimeoutError(error)) {
    return "llm_failure";
  }
  if (isOCRFailureError(error)) return "ocr_failure";
  if (isSpeechFailureError(error)) return "speech_failure";
  if (isPDFParseError(error)) return "pdf_parse_failure";
  if (isOfficeParseError(error)) return "office_parse_failure";
  if (isBusinessRuleError(error)) return error.code;
  return "ingestion.unknown";
}

async function markFailedSafely(
  container: ServiceArgs<RunIngestionJobInput>["container"],
  jobId: IngestionJobId,
  code: string,
  meta: { cause?: unknown; message?: string },
): Promise<void> {
  const now = container.clock.now();
  const reason =
    meta.message ??
    (meta.cause instanceof Error
      ? meta.cause.message
      : String(meta.cause ?? "ingestion pipeline failed"));
  try {
    await container.unitOfWorkProvider.run(
      async ({ ingestionJobRepository, collectEvents }) => {
        const found = await ingestionJobRepository.findById(
          jobId as unknown as IngestionJobIdBrand,
        );
        if (found === null) return;
        if (
          !IngestionJob.isProcessing(found.entity) &&
          !IngestionJob.isPending(found.entity) &&
          !IngestionJob.isPreviewing(found.entity)
        ) {
          return;
        }
        const transition = IngestionJob.markFailed(
          found.entity,
          code,
          reason,
          now,
        );
        await ingestionJobRepository.save(
          transition.entity,
          found.expectedVersion,
        );
        collectEvents(transition.eventDrafts);
      },
    );
  } catch (writeError) {
    container.logger.error("ingestion.markFailed.persistence_failed", {
      jobId,
      cause:
        writeError instanceof Error ? writeError.message : String(writeError),
    });
  }
}
