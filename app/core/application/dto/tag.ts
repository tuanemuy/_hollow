import type { Tag } from "@/core/domain/tag/entity";

export type TagDTO = Readonly<{
  id: string;
  ownerId: string;
  name: string;
  noteCount: number;
  /** Read-time `MAX(active notes.updatedAt)` (Issue #569). ISO string, or null when unused. */
  lastUsedAt: string | null;
}>;

/**
 * `noteCount` / `lastUsedAt` are read-time aggregates, not fields of the
 * `Tag` aggregate. Only the `listTags` path passes the real aggregates
 * (from `TagRepository.findByOwner`); the `createTag` / `renameTag` paths
 * pass `0` / `null` because their returned values are not read by the
 * frontend (display counts come from `listTags`).
 */
export function toTagDTO(
  tag: Tag,
  noteCount: number,
  lastUsedAt: Date | null,
): TagDTO {
  return {
    id: tag.id,
    ownerId: tag.ownerId,
    name: tag.name,
    noteCount,
    lastUsedAt: lastUsedAt === null ? null : lastUsedAt.toISOString(),
  };
}
