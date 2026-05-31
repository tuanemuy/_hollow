import type { IngestionJobDTO } from "@/core/application/dto/ingestion";
import type { InternalLinkRefDTO } from "@/core/application/dto/note";

/**
 * Transport-safe projection of `IngestionJobDTO` for client polling.
 *
 * `FrontMatterDTO` (`Record<string, unknown>`) cannot cross the
 * TanStack Start serialization boundary by type — its index signature
 * resolves to `unknown` which the framework rejects as "may not be
 * serializable". We therefore stringify the preview's FrontMatter into
 * `frontMatterJson` here and rehydrate it in `IngestionPreviewForm`.
 * This mirrors the note-side ADR-008 convention.
 *
 * `errorReason` is intentionally **not** projected onto the wire — it
 * is a free-form string built from raw `Error.message` chains in
 * `runIngestionJob.markFailedSafely` and would leak internal failure
 * detail to the UI. The DTO / domain / DB representation retains
 * `errorReason` for server-side observability (see `.issue/255/adr.md`
 * ADR-001).
 */
export type IngestionPreviewWire = Readonly<{
  title: string;
  contentHtml: string;
  suggestedDirectoryId: string | null;
  /** Canonical `/`-delimited new directory path to create on commit (root
   * excluded, e.g. `親/子`); a single segment is a top-level directory. */
  suggestedDirectoryName: string | null;
  frontMatterJson: string;
  suggestedTagNames: readonly string[];
  internalLinkRefs: readonly InternalLinkRefDTO[];
  mediaRefs: readonly string[];
}>;

export type IngestionJobWire = Readonly<{
  id: string;
  ownerId: string;
  originalFileName: string;
  mimeType: string;
  byteSize: number;
  kind: string;
  status: IngestionJobDTO["status"];
  preview: IngestionPreviewWire | null;
  errorCode: string | null;
  regenerationCount: number;
  savedAsNoteId: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export function toIngestionJobWire(job: IngestionJobDTO): IngestionJobWire {
  return {
    id: job.id as unknown as string,
    ownerId: job.ownerId as unknown as string,
    originalFileName: job.originalFileName,
    mimeType: job.mimeType,
    byteSize: job.byteSize,
    kind: job.kind,
    status: job.status,
    preview:
      job.preview === null
        ? null
        : {
            title: job.preview.title,
            contentHtml: job.preview.contentHtml,
            suggestedDirectoryId:
              job.preview.suggestedDirectoryId === null
                ? null
                : (job.preview.suggestedDirectoryId as unknown as string),
            suggestedDirectoryName: job.preview.suggestedDirectoryName,
            frontMatterJson: JSON.stringify(job.preview.frontMatter),
            suggestedTagNames: job.preview.suggestedTagNames,
            internalLinkRefs: job.preview.internalLinkRefs,
            mediaRefs: job.preview.mediaRefs.map(
              (id) => id as unknown as string,
            ),
          },
    errorCode: job.errorCode,
    regenerationCount: job.regenerationCount,
    savedAsNoteId:
      job.savedAsNoteId === null
        ? null
        : (job.savedAsNoteId as unknown as string),
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
