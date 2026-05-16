import type { Directory } from "@/core/domain/directory/entity";
import {
  type DirectoryDTO,
  type DirectoryTreeNode,
  toDirectoryDTO,
} from "../dto/directory";

export type { DirectoryDTO, DirectoryTreeNode } from "../dto/directory";
export { toDirectoryDTO } from "../dto/directory";

/**
 * Assemble a flat `Directory` list into the recursive `DirectoryTreeNode`
 * forest expected by the presentation layer.
 *
 * The repository returns every directory owned by the user as a flat
 * array; this helper groups by `parentId` and walks from the roots down,
 * preserving the repository-provided ordering inside each sibling group.
 */
export function toDirectoryTree(
  directories: readonly Directory[],
): readonly DirectoryTreeNode[] {
  const childrenByParent = new Map<string | null, Directory[]>();
  for (const dir of directories) {
    const key = dir.parentId === null ? null : (dir.parentId as string);
    const bucket = childrenByParent.get(key);
    if (bucket === undefined) {
      childrenByParent.set(key, [dir]);
    } else {
      bucket.push(dir);
    }
  }

  const build = (parentId: string | null): readonly DirectoryTreeNode[] => {
    const bucket = childrenByParent.get(parentId);
    if (bucket === undefined) return [];
    return bucket.map((dir) => {
      const dto: DirectoryDTO = toDirectoryDTO(dir);
      return {
        ...dto,
        children: build(dir.id as string),
      } satisfies DirectoryTreeNode;
    });
  };

  return build(null);
}
