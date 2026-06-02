import { Note as NoteEntity } from "@/core/domain/note/entity";
import type { NoteRepository } from "@/core/domain/note/ports/noteRepository";
import { TagEvents } from "@/core/domain/tag/events";
import { TagService } from "@/core/domain/tag/service";
import type { TagId as DomainTagId } from "@/core/domain/tag/valueObject";
import type { UserId } from "../dto/identity";
import type { NoteId } from "../dto/note";
import type { TagId } from "../dto/tag";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

const MERGE_NOTE_PAGE_SIZE = 500;

export type MergeTagsInput = {
  actorUserId: UserId;
  sourceTagId: TagId;
  targetTagId: TagId;
};

export type MergeTagsOutput = {
  affectedNoteIds: readonly NoteId[];
};

export async function mergeTags({
  container,
  input,
}: ServiceArgs<MergeTagsInput>): Promise<MergeTagsOutput> {
  const now = container.clock.now();

  const affected = await container.unitOfWorkProvider.run(
    async ({ tagRepository, noteRepository, collectEvents }) => {
      const sourceFound = await tagRepository.findById(input.sourceTagId);
      if (!sourceFound) {
        throw new NotFoundError(
          "TAG_NOT_FOUND",
          `Tag not found: ${input.sourceTagId}`,
        );
      }
      const targetFound = await tagRepository.findById(input.targetTagId);
      if (!targetFound) {
        throw new NotFoundError(
          "TAG_NOT_FOUND",
          `Tag not found: ${input.targetTagId}`,
        );
      }
      const actorId = input.actorUserId as string;
      if (
        (sourceFound.entity.ownerId as string) !== actorId ||
        (targetFound.entity.ownerId as string) !== actorId
      ) {
        throw new ForbiddenError(
          "TAG_OWNER_MISMATCH",
          "Tags are not owned by the actor",
        );
      }

      // Validate the merge plan (owner match, distinct tags).
      TagService.computeMergePlan(sourceFound.entity, targetFound.entity);

      const sourceTagId = sourceFound.entity.id as DomainTagId;
      const targetTagId = targetFound.entity.id as DomainTagId;
      const affectedIds: NoteId[] = [];

      const affectedNotes = await collectNotesWithTag(
        noteRepository,
        sourceFound.entity.ownerId,
        sourceTagId,
      );
      for (const note of affectedNotes) {
        const versioned = await noteRepository.findById(note.id);
        if (!versioned) continue;
        const current = versioned.entity;
        const nextTags = mergeTagSets(current.tagIds, sourceTagId, targetTagId);
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

      // The target tag row itself is unchanged by a merge (only note-side
      // `note_tags` are rewritten and the source row is deleted), so its
      // version is intentionally not advanced. The displayed usage count is
      // a read-time aggregate (see `TagRepository.findByOwner`).
      await tagRepository.delete(sourceTagId, sourceFound.expectedVersion);
      collectEvents([
        TagEvents.deleted(sourceTagId, sourceFound.entity.name, now),
      ]);
      return affectedIds;
    },
  );

  return { affectedNoteIds: affected };
}

function mergeTagSets(
  current: readonly DomainTagId[],
  source: DomainTagId,
  target: DomainTagId,
): readonly DomainTagId[] {
  const seen = new Set<string>();
  const out: DomainTagId[] = [];
  for (const id of current) {
    if (id === source) {
      if (!seen.has(target)) {
        seen.add(target);
        out.push(target);
      }
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (!seen.has(target)) {
    out.push(target);
  }
  return out;
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
      limit: MERGE_NOTE_PAGE_SIZE,
      offset,
      tagIds: [tagId],
    });
    if (notes.length === 0) break;
    all.push(...notes);
    if (notes.length < MERGE_NOTE_PAGE_SIZE) break;
    offset += notes.length;
  }
  return all;
}
