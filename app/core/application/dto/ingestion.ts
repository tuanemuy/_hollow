import type { IngestionJob } from "@/core/domain/ingestion/entity";
import type { IngestionPreview } from "@/core/domain/ingestion/valueObject";
import type { Instant } from "./common";
import { toInstant } from "./common";
import type { DirectoryId } from "./directory";
import type { MediaAssetId, UserId } from "./identity";
import type { FrontMatterDTO, InternalLinkRefDTO, NoteId } from "./note";
import { toInternalLinkRefDTO } from "./note";

export type IngestionJobId = string & { readonly __brand: "IngestionJobId" };

export type IngestionPreviewDTO = Readonly<{
  title: string;
  contentHtml: string;
  suggestedDirectoryId: DirectoryId | null;
  /** Canonical `/`-delimited new directory path to create on commit (root
   * excluded, e.g. `親/子`); a single segment is a top-level directory. */
  suggestedDirectoryName: string | null;
  frontMatter: FrontMatterDTO;
  suggestedTagNames: readonly string[];
  internalLinkRefs: readonly InternalLinkRefDTO[];
  mediaRefs: readonly MediaAssetId[];
}>;

export type IngestionJobDTO = Readonly<{
  id: IngestionJobId;
  ownerId: UserId;
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
  savedAsNoteId: NoteId | null;
  createdAt: Instant;
  updatedAt: Instant;
}>;

export function toIngestionPreviewDTO(
  preview: IngestionPreview,
): IngestionPreviewDTO {
  return {
    title: preview.title,
    contentHtml: preview.contentHtml,
    suggestedDirectoryId:
      preview.suggestedDirectoryId === null
        ? null
        : (preview.suggestedDirectoryId as unknown as DirectoryId),
    suggestedDirectoryName: preview.suggestedDirectoryName,
    frontMatter: { ...preview.frontMatter } as FrontMatterDTO,
    suggestedTagNames: preview.suggestedTagNames.map((name) => name as string),
    internalLinkRefs: preview.internalLinkRefs.map(toInternalLinkRefDTO),
    mediaRefs: preview.mediaRefs.map((id) => id as unknown as MediaAssetId),
  };
}

export function toIngestionJobDTO(job: IngestionJob): IngestionJobDTO {
  return {
    id: job.id as unknown as IngestionJobId,
    ownerId: job.ownerId as unknown as UserId,
    originalFileName: job.originalFileName,
    mimeType: job.mimeType,
    byteSize: job.byteSize,
    kind: job.kind,
    status: job.status,
    preview: job.preview === null ? null : toIngestionPreviewDTO(job.preview),
    errorCode: job.errorCode,
    errorReason: job.errorReason,
    regenerationCount: job.regenerationCount as number,
    savedAsNoteId:
      job.savedAsNoteId === null
        ? null
        : (job.savedAsNoteId as unknown as NoteId),
    createdAt: toInstant(job.createdAt),
    updatedAt: toInstant(job.updatedAt),
  };
}
