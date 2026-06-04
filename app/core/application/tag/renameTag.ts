import type { EventDraft } from "@/core/domain/common/event";
import type { Note } from "@/core/domain/note/entity";
import { Note as NoteEntity } from "@/core/domain/note/entity";
import type { NoteRepository } from "@/core/domain/note/ports/noteRepository";
import { Tag } from "@/core/domain/tag/entity";
import { TagService } from "@/core/domain/tag/service";
import {
  type TagId as DomainTagId,
  TagName,
} from "@/core/domain/tag/valueObject";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { type TagView, toTagView } from "./view";

const RENAME_NOTE_PAGE_SIZE = 500;

export type RenameTagInput = {
  actorUserId: string;
  tagId: string;
  newName: string;
};

export type RenameTagOutput = {
  tag: TagView;
  affectedNoteIds: readonly string[];
};

export async function renameTag({
  container,
  input,
}: ServiceArgs<RenameTagInput>): Promise<RenameTagOutput> {
  const now = container.clock.now();
  const newName = TagName.create(input.newName);

  const result = await container.unitOfWorkProvider.run(
    async ({ tagRepository, noteRepository, collectEvents }) => {
      const found = await tagRepository.findById(input.tagId);
      if (!found) {
        throw new NotFoundError(
          "TAG_NOT_FOUND",
          `Tag not found: ${input.tagId}`,
        );
      }
      if ((found.entity.ownerId as string) !== input.actorUserId) {
        throw new ForbiddenError(
          "TAG_OWNER_MISMATCH",
          `Tag ${input.tagId} is not owned by ${input.actorUserId}`,
        );
      }

      const tagId = found.entity.id as DomainTagId;
      const oldName = found.entity.name;
      await TagService.assertNameUnique(
        found.entity.ownerId,
        newName,
        tagId,
        tagRepository,
      );

      const renamed = Tag.rename(found.entity, newName, now);
      if (renamed === found.entity) {
        return { tag: found.entity, affectedNoteIds: [] as readonly string[] };
      }
      await tagRepository.save(renamed, found.expectedVersion);

      const affected: string[] = [];
      if (!TagName.equals(oldName, newName)) {
        let offset = 0;
        while (true) {
          const notes = await noteRepository.findByOwner(found.entity.ownerId, {
            limit: RENAME_NOTE_PAGE_SIZE,
            offset,
            tagIds: [tagId],
          });
          if (notes.length === 0) break;
          for (const note of notes) {
            await rewriteNoteBody(
              note,
              oldName,
              newName,
              now,
              noteRepository,
              collectEvents,
              affected,
            );
          }
          if (notes.length < RENAME_NOTE_PAGE_SIZE) break;
          offset += notes.length;
        }
      }

      return { tag: renamed, affectedNoteIds: affected };
    },
  );

  return {
    // The returned `noteCount` is not read by the frontend (display counts
    // come from `listTags`), so 0 is passed; a rename does not change usage.
    tag: toTagView(result.tag, 0),
    affectedNoteIds: result.affectedNoteIds,
  };
}

async function rewriteNoteBody(
  note: Note,
  oldName: TagName,
  newName: TagName,
  now: Date,
  noteRepository: NoteRepository,
  collectEvents: (drafts: readonly EventDraft[]) => void,
  affected: string[],
): Promise<void> {
  const nextHtml = TagService.renameInBody(note.contentHtml, oldName, newName);
  if (nextHtml === note.contentHtml) {
    return;
  }
  const versioned = await noteRepository.findById(note.id);
  if (!versioned) return;
  const { entity: updated, eventDrafts } = NoteEntity.updateContent(
    versioned.entity,
    {
      contentHtml: nextHtml,
      now,
      actorUserId: versioned.entity.ownerId,
      requireLock: false,
    },
  );
  await noteRepository.save(updated, versioned.expectedVersion);
  collectEvents(eventDrafts);
  affected.push(updated.id);
}
