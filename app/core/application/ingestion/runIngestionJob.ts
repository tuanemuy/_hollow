import type { Directory } from "@/core/domain/directory/entity";
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
  type PromptOverride,
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

  // Fetch the owner's directory tree once so the LLM can propose an
  // existing placement and the pipeline can resolve a match to a concrete
  // `DirectoryId`. A `findTree` failure must not abort ingestion — fall
  // back to an empty tree (no existing-directory context) so the job still
  // completes.
  let existingDirectories: readonly ExistingDirectory[] = [];
  try {
    const tree = await container.unitOfWorkProvider.run(
      ({ directoryRepository }) =>
        directoryRepository.findTree(promoted.ownerId),
    );
    existingDirectories = canonicalizeDirectoryPaths(tree);
  } catch (cause) {
    container.logger.warn("ingestion.directoryTree.fetch_failed", {
      jobId: input.jobId,
      cause: cause instanceof Error ? cause.message : String(cause),
    });
  }

  try {
    const preview = await runPipeline({
      bytes,
      kind: promoted.kind,
      ownerId: promoted.ownerId,
      existingDirectories,
      llm: container.llmProvider,
      ocr: container.ocrProvider,
      speech: container.speechRecognitionProvider,
      office: container.officeExtractor,
      pdf: container.pdfExtractor,
      sanitizer: container.htmlSanitizer,
      markdown: container.markdownConverter,
      promptResolver: container.promptResolver,
      promptOverride: promoted.promptOverride,
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
      // Roll `processing → pending` back before rethrowing so the queue
      // redelivery re-enters the `isPending` guard and re-drives the
      // pipeline once the rate limit clears (Issue #109). Without this
      // the row would sit `processing` and the redelivery would no-op,
      // stalling the job until DLQ → admin manual retry.
      const nowRollback = container.clock.now();
      try {
        await container.unitOfWorkProvider.run(
          async ({ ingestionJobRepository, collectEvents }) => {
            const found = await ingestionJobRepository.findById(
              input.jobId as unknown as IngestionJobIdBrand,
            );
            if (found === null) return;
            if (!IngestionJob.isProcessing(found.entity)) {
              // Concurrent transition (discard / fail) already moved the
              // job off `processing`; nothing to roll back.
              return;
            }
            const transition = IngestionJob.rollbackToPending(
              found.entity,
              nowRollback,
            );
            await ingestionJobRepository.save(
              transition.entity,
              found.expectedVersion,
            );
            collectEvents(transition.eventDrafts);
          },
        );
      } catch (rollbackError) {
        // A transient persistence failure here leaves the row in
        // `processing`; the next redelivery re-attempts the rollback
        // before the rate limit clears (the two-stage convergence in
        // ADR-001). Log so this rate-limit rollback is observable.
        container.logger.warn(
          "ingestion.rateLimitRollback.persistence_failed",
          {
            jobId: input.jobId,
            cause:
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError),
          },
        );
      }
      // Always rethrow the original rate-limit error so the consumer
      // classifies it as `retry` and re-delivers with backoff.
      throw error;
    }
    const code = classifyPipelineError(error);
    await markFailedSafely(container, input.jobId, code, {
      cause: error,
    });
  }
}

/**
 * Canonical directory path projection used both as LLM context and as the
 * left-hand side of `directorySuggestion` matching. `path` is the
 * slash-joined name chain (root excluded, no leading slash); `id` resolves
 * a match back to a concrete `DirectoryId`.
 */
type ExistingDirectory = Readonly<{
  id: DirectoryId;
  path: string;
}>;

type PipelineDeps = Readonly<{
  bytes: ArrayBuffer;
  kind: SourceFileKind;
  ownerId: UserId;
  existingDirectories: readonly ExistingDirectory[];
  llm: LLMProvider;
  ocr: OCRProvider;
  speech: SpeechRecognitionProvider;
  office: OfficeExtractor;
  pdf: PDFExtractor;
  sanitizer: HtmlSanitizer;
  markdown: { toHtml(markdown: string): Promise<string> };
  promptResolver: PromptResolver;
  promptOverride: Readonly<{
    structure: PromptOverride | null;
    metadata: PromptOverride | null;
  }>;
  mimeType: string;
  originalFileName: string;
}>;

async function runPipeline(deps: PipelineDeps): Promise<IngestionPreview> {
  const { kind } = deps;
  const text = await extractText(deps);
  // Prefer the per-upload override; only hit the resolver when none was
  // supplied for this purpose (#228). `structurePrompt` is consumed only
  // by the LLM-structuring branch below.
  const structurePrompt =
    deps.promptOverride.structure !== null
      ? (deps.promptOverride.structure as string)
      : await deps.promptResolver.resolveFor(
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
      existingDirectories: deps.existingDirectories.map((d) => d.path),
    });
    const sanitized = deps.sanitizer.sanitize(structured.html, {
      allowMedia: true,
      allowInternalLinks: true,
    });
    html = sanitized.html as string;
    titleSuggestion = structured.titleSuggestion;
    directorySuggestion = structured.directorySuggestion;
  }

  const metadataPrompt =
    deps.promptOverride.metadata !== null
      ? (deps.promptOverride.metadata as string)
      : await deps.promptResolver.resolveFor(
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

  // Resolve the LLM's path suggestion against the existing tree. A match
  // (case-insensitive, slash-normalised) resolves to a concrete
  // `DirectoryId` and clears the new-name field; a miss carries the full
  // canonical path forward as a new nested path for the commit to create.
  const { suggestedDirectoryId, suggestedDirectoryName } =
    resolveDirectorySuggestion(directorySuggestion, deps.existingDirectories);

  return IngestionPreview.create({
    title: NoteTitle.create(
      titleSuggestion.trim().length > 0
        ? titleSuggestion
        : fallbackTitle(deps.originalFileName),
    ),
    contentHtml: ContentHtml.create(html),
    suggestedDirectoryId,
    suggestedDirectoryName,
    frontMatter: FrontMatter.empty(),
    suggestedTagNames: tagNames,
    internalLinkRefs: [] as readonly InternalLinkRef[],
    mediaRefs: [],
  });
}

/**
 * Projects the owner's directory forest into canonical `{ id, path }`
 * rows. `path` is the slash-joined chain of `DirectoryName`s from the
 * top-level directory down to the node, with the virtual root (empty
 * name) excluded and no leading slash — e.g. `親名/子名`. This canonical
 * form is the single source for both the LLM context and the matching
 * left-hand side, so the two never drift on slash / root representation.
 */
function canonicalizeDirectoryPaths(
  tree: readonly Directory[],
): readonly ExistingDirectory[] {
  const byId = new Map<string, Directory>();
  for (const dir of tree) {
    byId.set(dir.id as unknown as string, dir);
  }
  const result: ExistingDirectory[] = [];
  for (const dir of tree) {
    // Skip the virtual root (empty name); only navigable directories are
    // valid placement targets.
    if (dir.parentId === null) continue;
    const segments: string[] = [];
    let cursor: Directory | undefined = dir;
    // Walk up to the root, collecting names. `visited` guards against a
    // corrupt parent cycle (A.parent=B, B.parent=A) which would otherwise
    // spin forever — mirrors the d1 `findAncestors` guard. On a cycle we
    // drop the partial path and skip the row rather than hang the worker.
    const visited = new Set<string>();
    let broken = false;
    while (cursor !== undefined && cursor.parentId !== null) {
      const cursorId = cursor.id as unknown as string;
      if (visited.has(cursorId)) {
        broken = true;
        break;
      }
      visited.add(cursorId);
      segments.unshift(cursor.name as unknown as string);
      cursor = byId.get(cursor.parentId as unknown as string);
    }
    if (broken) continue;
    result.push({ id: dir.id, path: segments.join("/") });
  }
  return result;
}

/**
 * Normalise a path for matching: lower-case (mirrors
 * `DirectoryName.equals`), trim, and collapse leading/trailing/repeated
 * slashes so `/a//b/` and `a/b` compare equal. Kept deliberately
 * conservative so a near-miss falls back to a new directory rather than
 * over-matching an unrelated existing one.
 */
function normalizePathForMatch(path: string): string {
  return path
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join("/")
    .toLowerCase();
}

function resolveDirectorySuggestion(
  directorySuggestion: string | null,
  existingDirectories: readonly ExistingDirectory[],
): {
  suggestedDirectoryId: DirectoryId | null;
  suggestedDirectoryName: string | null;
} {
  if (directorySuggestion === null || directorySuggestion.trim().length === 0) {
    return { suggestedDirectoryId: null, suggestedDirectoryName: null };
  }
  const normalizedSuggestion = normalizePathForMatch(directorySuggestion);
  if (normalizedSuggestion.length === 0) {
    return { suggestedDirectoryId: null, suggestedDirectoryName: null };
  }
  for (const existing of existingDirectories) {
    if (normalizePathForMatch(existing.path) === normalizedSuggestion) {
      // Existing match: resolve the id and clear the new-name field so the
      // VO's length validation (which only applies to new names) is not hit.
      return {
        suggestedDirectoryId: existing.id,
        suggestedDirectoryName: null,
      };
    }
  }
  // Miss: carry the full canonical path (slash-joined, trimmed, empties
  // dropped) forward as a new nested path. Original case is preserved so
  // the created directory keeps its display name — only the match above
  // lower-cases. Final acceptance (depth / segment length / forbidden
  // chars) is `IngestionPreview.create`'s best-effort null-ing, so an
  // over-eager LLM proposal is never fatal here.
  const segments = directorySuggestion
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  return {
    suggestedDirectoryId: null,
    suggestedDirectoryName: segments.length > 0 ? segments.join("/") : null,
  };
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
