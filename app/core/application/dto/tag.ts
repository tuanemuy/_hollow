import type { Tag } from "@/core/domain/tag/entity";
import type { UserId } from "./identity";

export type TagId = string & { readonly __brand: "TagId" };

export type TagDTO = Readonly<{
  id: TagId;
  ownerId: UserId;
  name: string;
  noteCount: number;
}>;

export function toTagDTO(tag: Tag): TagDTO {
  return {
    id: tag.id as unknown as TagId,
    ownerId: tag.ownerId as unknown as UserId,
    name: tag.name,
    noteCount: tag.noteCount,
  };
}
