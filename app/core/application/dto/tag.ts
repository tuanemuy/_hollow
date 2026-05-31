import type { Tag } from "@/core/domain/tag/entity";
import type { UserId } from "./identity";

export type TagId = string & { readonly __brand: "TagId" };

export type TagDTO = Readonly<{
  id: TagId;
  ownerId: UserId;
  name: string;
  noteCount: number;
}>;

/**
 * `noteCount` is a read-time aggregate, not a field of the `Tag`
 * aggregate. Only the `listTags` path passes the real aggregate (from
 * `TagRepository.findByOwner`); the `createTag` / `renameTag` paths pass
 * 0 because their returned `noteCount` is not read by the frontend.
 */
export function toTagDTO(tag: Tag, noteCount: number): TagDTO {
  return {
    id: tag.id as unknown as TagId,
    ownerId: tag.ownerId as unknown as UserId,
    name: tag.name,
    noteCount,
  };
}
