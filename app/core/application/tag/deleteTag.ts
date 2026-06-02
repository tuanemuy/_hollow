import { Note as NoteEntity } from "@/core/domain/note/entity";
import type { NoteRepository } from "@/core/domain/note/ports/noteRepository";
import { TagEvents } from "@/core/domain/tag/events";
import type { TagId as DomainTagId } from "@/core/domain/tag/valueObject";
import { TagBlacklistEntry } from "@/core/domain/tag/valueObject";
import type { UserId } from "../dto/identity";
import type { NoteId } from "../dto/note";
import type { TagId } from "../dto/tag";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

const DELETE_NOTE_PAGE_SIZE = 500;

export type DeleteTagInput = {
  actorUserId: UserId;
  tagId: TagId;
};

export type DeleteTagOutput = {
  affectedNoteIds: readonly NoteId[];
};

export async function deleteTag({
  container,
  input,
}: ServiceArgs<DeleteTagInput>): Promise<DeleteTagOutput> {
  const now = container.clock.now();

  const affected = await container.unitOfWorkProvider.run(
    async ({
      tagRepository,
      tagBlacklistRepository,
      noteRepository,
      collectEvents,
    }) => {
      const found = await tagRepository.findById(input.tagId);
      if (!found) {
        throw new NotFoundError(
          "TAG_NOT_FOUND",
          `Tag not found: ${input.tagId}`,
        );
      }
      if ((found.entity.ownerId as string) !== (input.actorUserId as string)) {
        throw new ForbiddenError(
          "TAG_OWNER_MISMATCH",
          `Tag ${input.tagId} is not owned by ${input.actorUserId}`,
        );
      }

      const tagId = found.entity.id as DomainTagId;
      const affectedIds: NoteId[] = [];
      const notes = await collectNotesWithTag(
        noteRepository,
        found.entity.ownerId,
        tagId,
      );
      for (const note of notes) {
        const versioned = await noteRepository.findById(note.id);
        if (!versioned) continue;
        const current = versioned.entity;
        const nextTags = current.tagIds.filter((id) => id !== tagId);
        const { entity: updated, eventDrafts } = NoteEntity.replaceTags(
          current,
          nextTags,
          now,
        );
        if (eventDrafts.length === 0) continue;
        await noteRepository.save(updated, versioned.expectedVersion);
        collectEvents(eventDrafts);
        affectedIds.push(updated.id as unknown as NoteId);
      }

      await tagBlacklistRepository.add(
        TagBlacklistEntry.create({
          ownerId: found.entity.ownerId,
          name: found.entity.name,
          addedAt: now,
        }),
      );
      await tagRepository.delete(tagId, found.expectedVersion);
      collectEvents([TagEvents.deleted(tagId, found.entity.name, now)]);
      return affectedIds;
    },
  );

  return { affectedNoteIds: affected };
}

async function collectNotesWithTag(
  noteRepository: NoteRepository,
  ownerId: import("@/core/domain/identity/valueObject").UserId,
  tagId: DomainTagId,
): Promise<readonly import("@/core/domain/note/entity").Note[]> {
  const all: import("@/core/domain/note/entity").Note[] = [];
  let offset = 0;
  while (true) {
    const notes = await noteRepository.findByOwner(ownerId, {
      limit: DELETE_NOTE_PAGE_SIZE,
      offset,
      tagIds: [tagId],
    });
    if (notes.length === 0) break;
    all.push(...notes);
    if (notes.length < DELETE_NOTE_PAGE_SIZE) break;
    offset += notes.length;
  }
  return all;
}
