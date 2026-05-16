import { ExportJob } from "@/core/domain/export/entity";
import { ExportService } from "@/core/domain/export/service";
import {
  type ExportFormat,
  ExportOptions,
  PdfPaperSize,
} from "@/core/domain/export/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { Note } from "@/core/domain/note/entity";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { PublicationVisibility } from "@/core/domain/publication/valueObject";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

/**
 * DTO mirror of `ExportOptions`. The PDF paper size is `null` for
 * non-PDF formats; transport-boundary validators enforce that
 * combination before the call reaches this usecase.
 */
export type ExportOptionsInput = Readonly<{
  includeFrontMatter: boolean;
  embedMedia: boolean;
  pdfPaperSize: "A4" | "Letter" | null;
}>;

export type StartExportJobInput = Readonly<{
  actorUserId: UserId | null;
  format: ExportFormat;
  targetNoteId: NoteId;
  options: ExportOptionsInput;
}>;

export type StartExportJobOutput = Readonly<{
  artifact: Readonly<{
    fileName: string;
    bytes: ArrayBuffer;
    mimeType: string;
  }>;
}>;

const MIME_BY_FORMAT: Readonly<Record<ExportFormat, string>> = {
  html: "text/html",
  markdown: "text/markdown",
  pdf: "application/pdf",
};

const EXTENSION_BY_FORMAT: Readonly<Record<ExportFormat, string>> = {
  html: "html",
  markdown: "md",
  pdf: "pdf",
};

function fileBaseName(note: Note): string {
  const candidate = (note.slug as unknown as string)
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim();
  return candidate.length === 0 ? (note.id as unknown as string) : candidate;
}

/**
 * Synchronous, single-note export. Loads the note inside a UoW only to
 * read the entity (no aggregate mutation, no `ExportJob` persistence),
 * checks access through `ExportService.assertCanAccess`, then renders
 * the artifact bytes inline. The transient `ExportJob` exists purely so
 * the rendering paths receive the same value-object envelope they get
 * in the async flow.
 */
export async function startExportJob({
  container,
  input,
}: ServiceArgs<StartExportJobInput>): Promise<StartExportJobOutput> {
  const now = container.clock.now();
  const id = container.idGenerator.next();

  const options = ExportOptions.create({
    includeFrontMatter: input.options.includeFrontMatter,
    embedMedia: input.options.embedMedia,
    pdfPaperSize:
      input.options.pdfPaperSize === null
        ? null
        : PdfPaperSize.create(input.options.pdfPaperSize),
  });

  const note = await container.unitOfWorkProvider.run(
    async ({ noteRepository, publicationStateRepository }) => {
      const found = await noteRepository.findById(input.targetNoteId);
      if (found === null || found.entity.status !== "active") {
        throw new NotFoundError(
          "EXPORT_NOTE_NOT_FOUND",
          `Note not found for export: ${input.targetNoteId}`,
        );
      }
      const ownerMap = new Map<NoteId, UserId>([
        [found.entity.id, found.entity.ownerId],
      ]);
      const visibilityMap = new Map<NoteId, PublicationVisibility>();
      const publication = await publicationStateRepository.findById(
        found.entity.id,
      );
      visibilityMap.set(
        found.entity.id,
        publication === null ? "private" : publication.entity.visibility,
      );
      ExportService.assertCanAccess({
        viewerOwnerId: input.actorUserId,
        targetNoteIds: [found.entity.id],
        visibilityMap,
        ownerMap,
      });
      return found.entity;
    },
  );

  const { entity: job } = ExportJob.create(
    {
      id,
      // Anonymous viewers reuse the note owner so the transient job
      // satisfies the `ownerId: UserId` invariant. The job is never
      // persisted, so this attribution does not leak.
      ownerId: input.actorUserId ?? note.ownerId,
      format: input.format,
      scope: "single",
      targetNoteIds: [note.id],
      viewQuery: null,
      options,
    },
    now,
  );

  const bytes = await renderArtifactBytes(container, job, note);
  return {
    artifact: {
      fileName: `${fileBaseName(note)}.${EXTENSION_BY_FORMAT[input.format]}`,
      bytes,
      mimeType: MIME_BY_FORMAT[input.format],
    },
  };
}

async function renderArtifactBytes(
  container: ServiceArgs<StartExportJobInput>["container"],
  job: ReturnType<typeof ExportJob.create>["entity"],
  note: Note,
): Promise<ArrayBuffer> {
  switch (job.format) {
    case "html": {
      const html = await container.htmlRenderer.wrapForExport(
        note.contentHtml,
        {
          includeFrontMatter: job.options.includeFrontMatter,
          frontMatter: note.frontMatter,
          designTokens: container.exportDesignTokens,
        },
      );
      return new TextEncoder().encode(html).buffer as ArrayBuffer;
    }
    case "markdown": {
      const md = await container.markdownRenderer.fromHtml(note.contentHtml, {
        includeFrontMatter: job.options.includeFrontMatter,
        frontMatter: note.frontMatter,
      });
      return new TextEncoder().encode(md).buffer as ArrayBuffer;
    }
    case "pdf": {
      // Entity factory rejects pdf jobs without a paper size; defensive
      // narrow keeps the renderer call type-safe.
      if (job.options.pdfPaperSize === null) {
        throw new NotFoundError(
          "EXPORT_PDF_PAPER_SIZE_MISSING",
          "pdfPaperSize is required for pdf export",
        );
      }
      const wrapped = await container.htmlRenderer.wrapForExport(
        note.contentHtml,
        {
          includeFrontMatter: job.options.includeFrontMatter,
          frontMatter: note.frontMatter,
          designTokens: container.exportDesignTokens,
        },
      );
      return container.pdfRenderer.render(wrapped, {
        paper: job.options.pdfPaperSize,
        embedMedia: job.options.embedMedia,
        mediaResolver: async (mediaId) => {
          const asset = await container.unitOfWorkProvider.run(
            async ({ mediaAssetRepository }) =>
              mediaAssetRepository.findById(mediaId),
          );
          if (asset === null) return null;
          try {
            return await container.objectStorage.get(asset.storageKey);
          } catch {
            return null;
          }
        },
      });
    }
  }
}
