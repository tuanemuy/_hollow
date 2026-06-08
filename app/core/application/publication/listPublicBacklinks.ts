import { NoteId as NoteIdVO } from "@/core/domain/note/valueObject";
import type { BacklinkDTO } from "../dto/note";
import { NotFoundError } from "../errors";
import { buildBacklinkSnippet, toBacklink } from "../note/view";
import type { ServiceArgs } from "../types";

export type ListPublicBacklinksInput = Readonly<{
  noteId: string;
}>;

export type ListPublicBacklinksOutput = Readonly<{
  backlinks: readonly BacklinkDTO[];
}>;

/**
 * Public-facing backlinks for one note: referrers that are themselves
 * public. The visibility gate mirrors {@link getPublicNote} — the target
 * note must be active and `PublicationState.visibility === 'public'`,
 * otherwise the result is `NotFoundError` so private / missing notes are
 * indistinguishable on the public surface (no enumeration).
 *
 * Referrer visibility is resolved by the publication aggregate
 * (`findByNoteIds`) rather than by pushing a `visibility` filter into the
 * note port — keeping the "who is public" concern inside the publication
 * boundary (ADR-001). Directory segments are intentionally not surfaced:
 * exposing a referrer's folder path would leak the author's private tree
 * organisation onto the public surface (ADR-006), so the projection
 * carries `directorySegments: []`.
 *
 * Unlike the owner-scoped {@link getBacklinks}, this usecase takes no
 * `actorUserId` — it is public-only and performs no ownership check.
 */
export async function listPublicBacklinks({
  container,
  input,
}: ServiceArgs<ListPublicBacklinksInput>): Promise<ListPublicBacklinksOutput> {
  const noteId = NoteIdVO.create(input.noteId);
  return container.unitOfWorkProvider.run(
    async ({ noteRepository, publicationStateRepository, userRepository }) => {
      const target = await noteRepository.findById(noteId);
      if (target === null || target.entity.status !== "active") {
        throw new NotFoundError("note", `Note not found: ${input.noteId}`);
      }
      const owner = await userRepository.findById(target.entity.ownerId);
      if (
        owner === null ||
        owner.entity.status === "deleted" ||
        owner.entity.status === "suspended"
      ) {
        throw new NotFoundError("note", `Note not available: ${input.noteId}`);
      }
      const targetState = await publicationStateRepository.findById(noteId);
      if ((targetState?.entity.visibility ?? "private") !== "public") {
        throw new NotFoundError("note", `Note is not public: ${input.noteId}`);
      }

      const referrers = await noteRepository.findReferrers(noteId);
      const activeReferrers = referrers.filter((r) => r.status === "active");
      if (activeReferrers.length === 0) {
        return { backlinks: [] };
      }

      const states = await publicationStateRepository.findByNoteIds(
        activeReferrers.map((r) => r.id),
      );
      const publicIds = new Set(
        states
          .filter((s) => s.visibility === "public")
          .map((s) => s.noteId as string),
      );

      const backlinks = activeReferrers
        .filter((r) => publicIds.has(r.id))
        .map((referrer) =>
          toBacklink(referrer, {
            snippet: buildBacklinkSnippet(container.htmlSanitizer, referrer),
            // ADR-006: never surface the referrer's folder path publicly.
            directorySegments: [],
          }),
        );

      return { backlinks };
    },
  );
}
