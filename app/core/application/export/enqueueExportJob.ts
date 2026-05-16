import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { ExportJob } from "@/core/domain/export/entity";
import { ExportService } from "@/core/domain/export/service";
import {
  DateRange,
  type ExportFormat,
  ExportOptions,
  type ExportScope,
  PdfPaperSize,
  ViewQuerySnapshot,
  type ViewQuerySnapshot as ViewQuerySnapshotType,
} from "@/core/domain/export/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { Note } from "@/core/domain/note/entity";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { PublicationVisibility } from "@/core/domain/publication/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import type { ExportOptionsInput } from "./startExportJob";
import { type ExportJobDTO, toExportJobView } from "./view";

export type ViewQuerySnapshotInput = Readonly<{
  directoryId: DirectoryId | null;
  tagIds: readonly TagId[];
  dateRange: Readonly<{ from: Date | null; to: Date | null }> | null;
  keyword: string | null;
  referencingNoteId: NoteId | null;
}>;

export type EnqueueExportJobInput = Readonly<{
  actorUserId: UserId;
  format: ExportFormat;
  scope: Exclude<ExportScope, "single">;
  noteIds?: readonly NoteId[];
  viewQuery?: ViewQuerySnapshotInput;
  options: ExportOptionsInput;
}>;

export type EnqueueExportJobOutput = Readonly<{
  job: ExportJobDTO;
}>;

function buildViewQuerySnapshot(
  raw: ViewQuerySnapshotInput,
): ViewQuerySnapshotType {
  return ViewQuerySnapshot.create({
    directoryId: raw.directoryId,
    tagIds: raw.tagIds,
    dateRange:
      raw.dateRange === null
        ? null
        : DateRange.create({ from: raw.dateRange.from, to: raw.dateRange.to }),
    keyword: raw.keyword,
    referencingNoteId: raw.referencingNoteId,
  });
}

/**
 * Bulk / view-scope export request. Authorises ownership, enforces the
 * configured quota, persists the job as `pending`, and emits the
 * `export.job.requested` outbox event so the queue consumer picks it
 * up for `RunExportJob`.
 */
export async function enqueueExportJob({
  container,
  input,
}: ServiceArgs<EnqueueExportJobInput>): Promise<EnqueueExportJobOutput> {
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

  const viewQuery =
    input.viewQuery !== undefined
      ? buildViewQuerySnapshot(input.viewQuery)
      : null;
  const noteIds: readonly NoteId[] = input.noteIds ?? [];

  const job = await container.unitOfWorkProvider.run(
    async ({
      noteRepository,
      publicationStateRepository,
      exportJobRepository,
      collectEvents,
    }) => {
      // Authorisation: bulk scopes require viewer === owner for every
      // pre-resolved target note. `view` scope skips the upfront check
      // because the note set is resolved lazily by `RunExportJob`; the
      // service still enforces ownership at run time via the same map.
      if (input.scope === "multiple") {
        const notes: Note[] = [];
        for (const noteId of noteIds) {
          const found = await noteRepository.findById(noteId);
          if (found === null || found.entity.status !== "active") {
            throw new NotFoundError(
              "EXPORT_NOTE_NOT_FOUND",
              `Note not found for export: ${noteId}`,
            );
          }
          notes.push(found.entity);
        }
        const ownerMap = new Map<NoteId, UserId>(
          notes.map((n) => [n.id, n.ownerId] as const),
        );
        const visibilityMap = new Map<NoteId, PublicationVisibility>();
        for (const note of notes) {
          const publication = await publicationStateRepository.findById(
            note.id,
          );
          visibilityMap.set(
            note.id,
            publication === null ? "private" : publication.entity.visibility,
          );
        }
        ExportService.assertCanAccess({
          viewerOwnerId: input.actorUserId,
          targetNoteIds: notes.map((n) => n.id),
          visibilityMap,
          ownerMap,
        });
      }

      const existingActive = await exportJobRepository.findByOwner(
        input.actorUserId,
        { limit: 100, offset: 0, order: "desc" },
      );
      const currentUsage = existingActive.filter(
        (j) => j.status === "pending" || j.status === "processing",
      ).length;

      const { entity, eventDrafts } = ExportJob.create(
        {
          id,
          ownerId: input.actorUserId,
          format: input.format,
          scope: input.scope,
          targetNoteIds: noteIds,
          viewQuery,
          options,
        },
        now,
      );

      ExportService.enforceQuota(entity, currentUsage, container.exportLimits);

      await exportJobRepository.insert(entity);
      collectEvents(eventDrafts);
      return entity;
    },
  );

  return { job: toExportJobView(job) };
}
