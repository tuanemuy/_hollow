import { DirectoryService } from "@/core/domain/directory/service";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { NoteSourceFileDTO } from "../dto/note";
import {
  ForbiddenError,
  NotFoundError,
  SystemError,
  SystemErrorCode,
} from "../errors";
import type { ServiceArgs } from "../types";
import type { BacklinkDTO, NoteDTO } from "./view";
import { buildBacklinkSnippet, toBacklink, toNoteView } from "./view";

export type GetNoteDetailInput = Readonly<{
  actorUserId: string;
  noteId: string;
}>;

export type GetNoteDetailOutput = Readonly<{
  note: NoteDTO & { sourceFile: NoteSourceFileDTO | null };
  /**
   * Display-rendered note body: the stored `contentHtml` with
   * `[[wikilink]]` / `#hashtag` tokens marked up as pills (read path
   * only). The DTO's `contentHtml` keeps the verbatim tokens for
   * editing / export.
   */
  renderedContentHtml: string;
  backlinks: readonly BacklinkDTO[];
  backlinkCount: number;
  directoryPath: string;
  directorySegments: readonly { id: string; name: string }[];
}>;

// Inline backlinks on the detail panel are a preview, not the full set:
// the heavy referrer hydration is capped here and the exact total is
// shown via `backlinkCount`. The "see all referrers" footer link drives
// the paginated home filter for the rest (Issue #46).
const BACKLINK_PREVIEW_LIMIT = 5;

export async function getNoteDetail({
  container,
  input,
}: ServiceArgs<GetNoteDetailInput>): Promise<GetNoteDetailOutput> {
  return container.unitOfWorkProvider.run(async (ctx) => {
    const found = await ctx.noteRepository.findById(input.noteId as NoteId);
    if (!found) {
      throw new NotFoundError(
        "NOTE_NOT_FOUND",
        `Note not found: ${input.noteId}`,
      );
    }
    if (found.entity.ownerId !== input.actorUserId) {
      throw new ForbiddenError(
        "NOTE_FORBIDDEN",
        `Note ${input.noteId} is owned by another user`,
      );
    }
    // Reads against the binding share no in-flight transaction, so the
    // bounded preview and the (unbounded) referrer total run
    // concurrently. Both omit a status filter so the count and the
    // preview share the same population (trashed referrers included).
    const [referrers, backlinkCount] = await Promise.all([
      ctx.noteRepository.findReferrers(found.entity.id, {
        limit: BACKLINK_PREVIEW_LIMIT,
        offset: 0,
      }),
      ctx.noteRepository.countByOwner(found.entity.ownerId, {
        referencingNoteId: found.entity.id,
      }),
    ]);
    // Source-file projection: one confirmed read inside the existing UoW
    // (Issue #452). `sourceFile` is synthesised locally and merged onto
    // the note DTO so `toNoteView` / `toNoteDTO` keep their signatures.
    // A bound sourceFileId always resolves to a source asset (the FK is
    // ON DELETE SET NULL, so it clears rather than dangles) carrying the
    // filename captured at ingestion upload — a miss on either is drifted
    // persistence, not a "no source file" case, so fail loud.
    let sourceFile: NoteSourceFileDTO | null = null;
    if (found.entity.sourceFileId !== null) {
      const asset = await ctx.mediaAssetRepository.findById(
        found.entity.sourceFileId,
      );
      if (asset === null || asset.originalFileName === null) {
        throw new SystemError(
          SystemErrorCode.DataIntegrityError,
          `Source media for note ${found.entity.id} is missing or has no filename`,
        );
      }
      sourceFile = {
        mediaId: asset.id,
        originalFileName: asset.originalFileName,
      };
    }

    const dir = await ctx.directoryRepository.findById(
      found.entity.directoryId,
    );
    const directoryPath = dir
      ? await DirectoryService.computePath(dir.entity, ctx.directoryRepository)
      : "/";
    const directorySegments = dir
      ? (
          await DirectoryService.computeSegments(
            dir.entity,
            ctx.directoryRepository,
          )
        ).map((seg) => ({
          id: seg.id as string,
          name: seg.name as string,
        }))
      : [];
    // Resolve every referrer's directory path in a single tree read
    // (`O(1)` queries) so the backlink cards can show their location
    // line. Referrers share the note owner, so one tree covers them all.
    const referrerSegmentsByDir = await DirectoryService.computeSegmentsForMany(
      found.entity.ownerId,
      referrers.map((r) => r.directoryId as DirectoryId),
      ctx.directoryRepository,
    );
    const segmentsForReferrer = (
      dirId: DirectoryId,
    ): readonly { id: string; name: string }[] =>
      (referrerSegmentsByDir.get(dirId) ?? []).map((seg) => ({
        id: seg.id as string,
        name: seg.name as string,
      }));

    return {
      note: { ...toNoteView(found.entity), sourceFile },
      renderedContentHtml: container.noteBodyRenderer.renderForDisplay(
        found.entity.contentHtml,
        found.entity.internalLinkRefs,
      ),
      backlinks: referrers.map((referrer) =>
        toBacklink(referrer, {
          snippet: buildBacklinkSnippet(container.htmlSanitizer, referrer),
          directorySegments: segmentsForReferrer(
            referrer.directoryId as DirectoryId,
          ),
        }),
      ),
      backlinkCount,
      directoryPath: directoryPath as string,
      directorySegments,
    };
  });
}
