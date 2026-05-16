import { Version } from "@/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { TagErrorCode } from "./errorCode";
import { TagId, TagName } from "./valueObject";

/**
 * Per-user catalog tag attached to notes.
 *
 * `noteCount` is a derived projection kept on the aggregate so that
 * listing/filtering does not need to join through note assignments.
 * It is mutated via `incrementNoteCount` / `decrementNoteCount` driven
 * by note-side events. The `noteCount >= 0` invariant is enforced
 * during decrement.
 */
export type Tag = Readonly<{
  id: TagId;
  ownerId: UserId;
  name: TagName;
  noteCount: number;
  version: Version;
  createdAt: Date;
  updatedAt: Date;
}>;

type ReconstructInput = Readonly<{
  id: string;
  ownerId: string;
  name: string;
  noteCount: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}>;

function rename(tag: Tag, newName: TagName, now: Date): Tag {
  if (TagName.equals(tag.name, newName)) {
    return tag;
  }
  return {
    ...tag,
    name: newName,
    version: Version.next(tag.version),
    updatedAt: now,
  };
}

function incrementNoteCount(tag: Tag, now: Date): Tag {
  return {
    ...tag,
    noteCount: tag.noteCount + 1,
    version: Version.next(tag.version),
    updatedAt: now,
  };
}

function decrementNoteCount(tag: Tag, now: Date): Tag {
  if (tag.noteCount <= 0) {
    throw new BusinessRuleError(
      TagErrorCode.NoteCountNegative,
      `Tag noteCount cannot go below zero (id=${tag.id})`,
    );
  }
  return {
    ...tag,
    noteCount: tag.noteCount - 1,
    version: Version.next(tag.version),
    updatedAt: now,
  };
}

export const Tag = {
  create: (
    params: {
      id: string;
      ownerId: UserId;
      name: TagName;
    },
    now: Date,
  ): Tag => {
    return {
      id: TagId.create(params.id),
      ownerId: params.ownerId,
      name: params.name,
      noteCount: 0,
      version: Version.initial(),
      createdAt: now,
      updatedAt: now,
    };
  },

  // Persistence rows are untrusted at the type level; re-validate each
  // field through its value object and wrap any failure in
  // `RehydrationError` so adapters can translate it into
  // `SystemError(DataIntegrityError)`.
  reconstruct: (input: ReconstructInput): Tag => {
    try {
      if (!Number.isInteger(input.noteCount) || input.noteCount < 0) {
        throw new BusinessRuleError(
          TagErrorCode.NoteCountNegative,
          `Invalid noteCount: ${input.noteCount}`,
        );
      }
      return {
        id: TagId.create(input.id),
        ownerId: input.ownerId as UserId,
        name: TagName.create(input.name),
        noteCount: input.noteCount,
        version: Version.create(input.version),
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      };
    } catch (error) {
      throw new RehydrationError(
        `Failed to rehydrate Tag (id=${input.id})`,
        error,
      );
    }
  },

  rename,
  incrementNoteCount,
  decrementNoteCount,
};
