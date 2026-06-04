import type { IngestionJob } from "@/core/domain/ingestion/entity";
import type { IngestionPreview } from "@/core/domain/ingestion/valueObject";
import type { Instant } from "./common";
import { toInstant } from "./common";
import type { FrontMatterDTO, InternalLinkRefDTO } from "./note";
import { toInternalLinkRefDTO } from "./note";

export type IngestionPreviewDTO = Readonly<{
  title: string;
  contentHtml: string;
  suggestedDirectoryId: string | null;
  /** Canonical `/`-delimited new directory path to create on commit (root
   * excluded, e.g. `親/子`); a single segment is a top-level directory. */
  suggestedDirectoryName: string | null;
  frontMatter: FrontMatterDTO;
  suggestedTagNames: readonly string[];
  internalLinkRefs: readonly InternalLinkRefDTO[];
  mediaRefs: readonly string[];
}>;

export type IngestionJobDTO = Readonly<{
  id: string;
  ownerId: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  kind: string;
  status:
    | "pending"
    | "processing"
    | "previewing"
    | "saved"
    | "failed"
    | "discarded";
  preview: IngestionPreviewDTO | null;
  errorCode: string | null;
  errorReason: string | null;
  regenerationCount: number;
  savedAsNoteId: string | null;
  createdAt: Instant;
  updatedAt: Instant;
}>;

export function toIngestionPreviewDTO(
  preview: IngestionPreview,
): IngestionPreviewDTO {
  return {
    title: preview.title,
    contentHtml: preview.contentHtml,
    suggestedDirectoryId: preview.suggestedDirectoryId,
    suggestedDirectoryName: preview.suggestedDirectoryName,
    frontMatter: { ...preview.frontMatter } as FrontMatterDTO,
    suggestedTagNames: preview.suggestedTagNames.map((name) => name as string),
    internalLinkRefs: preview.internalLinkRefs.map(toInternalLinkRefDTO),
    mediaRefs: preview.mediaRefs,
  };
}

export function toIngestionJobDTO(job: IngestionJob): IngestionJobDTO {
  return {
    id: job.id,
    ownerId: job.ownerId,
    originalFileName: job.originalFileName,
    mimeType: job.mimeType,
    byteSize: job.byteSize,
    kind: job.kind,
    status: job.status,
    preview: job.preview === null ? null : toIngestionPreviewDTO(job.preview),
    errorCode: job.errorCode,
    errorReason: job.errorReason,
    regenerationCount: job.regenerationCount as number,
    savedAsNoteId: job.savedAsNoteId,
    createdAt: toInstant(job.createdAt),
    updatedAt: toInstant(job.updatedAt),
  };
}
