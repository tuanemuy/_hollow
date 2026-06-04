import type { Directory } from "@/core/domain/directory/entity";
import type { Instant } from "./common";
import { toInstant } from "./common";

export type DirectoryDTO = Readonly<{
  id: string;
  ownerId: string;
  parentId: string | null;
  name: string;
  slug: string;
  depth: number;
  createdAt: Instant;
  updatedAt: Instant;
}>;

export type DirectoryTreeNode = DirectoryDTO &
  Readonly<{ children: readonly DirectoryTreeNode[] }>;

export function toDirectoryDTO(directory: Directory): DirectoryDTO {
  return {
    id: directory.id,
    ownerId: directory.ownerId,
    parentId: directory.parentId,
    name: directory.name,
    slug: directory.slug,
    depth: directory.depth as number,
    createdAt: toInstant(directory.createdAt),
    updatedAt: toInstant(directory.updatedAt),
  };
}
