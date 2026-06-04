import type { Tag } from "@/core/domain/tag/entity";

export type TagDTO = Readonly<{
  id: string;
  ownerId: string;
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
    id: tag.id,
    ownerId: tag.ownerId,
    name: tag.name,
    noteCount,
  };
}
