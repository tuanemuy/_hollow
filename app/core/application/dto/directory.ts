import type { Directory } from "@/core/domain/directory/entity";
import type { Instant } from "./common";
import { toInstant } from "./common";
import type { UserId } from "./identity";

export type DirectoryId = string & { readonly __brand: "DirectoryId" };

export type DirectoryDTO = Readonly<{
  id: DirectoryId;
  ownerId: UserId;
  parentId: DirectoryId | null;
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
    id: directory.id as unknown as DirectoryId,
    ownerId: directory.ownerId as unknown as UserId,
    parentId:
      directory.parentId === null
        ? null
        : (directory.parentId as unknown as DirectoryId),
    name: directory.name,
    slug: directory.slug,
    depth: directory.depth as number,
    createdAt: toInstant(directory.createdAt),
    updatedAt: toInstant(directory.updatedAt),
  };
}
