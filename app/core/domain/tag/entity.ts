import { Version } from "@/core/domain/common/version";
import { RehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { TagId, TagName } from "./valueObject";

/**
 * Per-user catalog tag attached to notes.
 *
 * The displayed note-usage count is a read-time aggregate (see
 * `TagRepository.findByOwner`) and is intentionally not a field of this
 * aggregate.
 */
export type Tag = Readonly<{
  id: TagId;
  ownerId: UserId;
  name: TagName;
  version: Version;
  createdAt: Date;
  updatedAt: Date;
}>;

type ReconstructInput = Readonly<{
  id: string;
  ownerId: string;
  name: string;
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
      return {
        id: TagId.create(input.id),
        ownerId: input.ownerId as UserId,
        name: TagName.create(input.name),
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
};
