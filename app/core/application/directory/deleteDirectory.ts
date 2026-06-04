import type { EventDraft } from "@/core/domain/common/event";
import { Directory } from "@/core/domain/directory/entity";
import { DirectoryErrorCode } from "@/core/domain/directory/errorCode";
import { DirectoryEvents } from "@/core/domain/directory/events";
import type { DirectoryRepository } from "@/core/domain/directory/ports/directoryRepository";
import { DirectoryService } from "@/core/domain/directory/service";
import {
  DirectoryId,
  type DirectoryName,
} from "@/core/domain/directory/valueObject";
import { BusinessRuleError } from "@/core/domain/error";
import { UserId } from "@/core/domain/identity/valueObject";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import { NoteEvents } from "@/core/domain/note/events";
import type { NoteRepository } from "@/core/domain/note/ports/noteRepository";
import type { NoteId } from "@/core/domain/note/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type DeleteDirectoryInput = {
  actorUserId: string;
  directoryId: string;
};

export type DeleteDirectoryOutput = {
  trashedNoteIds: readonly string[];
  deletedDirectoryIds: readonly string[];
};

export async function deleteDirectory({
  container,
  input,
}: ServiceArgs<DeleteDirectoryInput>): Promise<DeleteDirectoryOutput> {
  const now = container.clock.now();
  const actorUserId = UserId.create(input.actorUserId);
  const directoryId = DirectoryId.create(input.directoryId);

  const result = await container.unitOfWorkProvider.run(
    async ({ directoryRepository, noteRepository, collectEvents }) => {
      const found = await directoryRepository.findById(directoryId);
      if (found === null) {
        throw new NotFoundError(
          "DIRECTORY_NOT_FOUND",
          `Directory not found: ${directoryId}`,
        );
      }
      const dir = found.entity;

      if (dir.ownerId !== actorUserId) {
        throw new ForbiddenError(
          "DIRECTORY_FORBIDDEN",
          "Cannot delete another user's directory",
        );
      }

      if (Directory.isRoot(dir)) {
        throw new BusinessRuleError(
          DirectoryErrorCode.CannotDeleteRoot,
          "Cannot delete the root directory",
        );
      }

      // Capture mediaRefs per note BEFORE deleteSubtree buffers the
      // trash updates — at that point the rows still exist in their
      // active form, so reads return the intact note. The physical
      // writes are batched and applied at commit time.
      //
      // The directory-name map is captured in the same pre-delete walk so
      // `directory.deleted` events can carry the deleted directory's name
      // (Issue #405 ADR-A) — the rows are gone by emit time.
      const { mediaRefsByNoteId, directoryNamesById } =
        await collectSubtreeSnapshot(dir, directoryRepository, noteRepository);

      const { trashedNoteIds, deletedDirectoryIds } =
        await DirectoryService.deleteSubtree(dir, now, {
          dirRepo: directoryRepository,
          noteRepo: noteRepository,
        });

      const drafts: EventDraft[] = [];
      for (const noteId of trashedNoteIds) {
        drafts.push(
          NoteEvents.trashed(
            {
              noteId,
              ownerId: dir.ownerId,
              mediaRefs: mediaRefsByNoteId.get(noteId) ?? [],
            },
            now,
          ),
        );
      }
      // Issue #181: emit `directory.deleted` for every directory actually
      // removed (empty dirs included) so `view.handleDirectoryDeletedEvent`
      // can mark SavedViews filtering on `directoryId` as broken. Merged
      // into the same UoW / outbox batch as the `note.trashed` drafts so
      // only committed deletes get an event.
      for (const deletedDirectoryId of deletedDirectoryIds) {
        // `collectSubtreeSnapshot` names every removed node, so the miss
        // branch is unreachable defensive code; "" is the "name unknown"
        // sentinel for the broken-condition marker (consistent with the
        // event-decoder fallback in ADR-E), not a real directory name.
        const name =
          directoryNamesById.get(deletedDirectoryId) ?? ("" as DirectoryName);
        drafts.push(DirectoryEvents.deleted(deletedDirectoryId, name, now));
      }
      collectEvents(drafts);

      return { trashedNoteIds, deletedDirectoryIds };
    },
  );

  return {
    trashedNoteIds: result.trashedNoteIds,
    deletedDirectoryIds: result.deletedDirectoryIds,
  };
}

async function collectSubtreeSnapshot(
  root: Directory,
  dirRepo: DirectoryRepository,
  noteRepo: NoteRepository,
): Promise<{
  mediaRefsByNoteId: Map<NoteId, readonly MediaAssetId[]>;
  directoryNamesById: Map<DirectoryId, DirectoryName>;
}> {
  const mediaRefsByNoteId = new Map<NoteId, readonly MediaAssetId[]>();
  const directoryNamesById = new Map<DirectoryId, DirectoryName>();
  const visit: Directory[] = [root];
  while (visit.length > 0) {
    const node = visit.pop();
    if (node === undefined) break;
    directoryNamesById.set(node.id, node.name);
    // Active-only listing matches what `trashByDirectory` will sweep,
    // so the keys here align with the ids deleteSubtree returns.
    const notes = await noteRepo.findByDirectory(node.id, {
      limit: 1_000_000,
      offset: 0,
    });
    for (const note of notes) {
      if (note.status === "active") {
        mediaRefsByNoteId.set(note.id, note.mediaRefs);
      }
    }
    const children = await dirRepo.findChildren(node.id);
    for (const child of children) {
      visit.push(child);
    }
  }
  return { mediaRefsByNoteId, directoryNamesById };
}
