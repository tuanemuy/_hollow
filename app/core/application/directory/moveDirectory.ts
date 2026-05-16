import { type ChildDirectory, Directory } from "@/core/domain/directory/entity";
import { DirectoryErrorCode } from "@/core/domain/directory/errorCode";
import type { DirectoryRepository } from "@/core/domain/directory/ports/directoryRepository";
import { DirectoryService } from "@/core/domain/directory/service";
import {
  DirectoryDepth,
  DirectoryId,
  MAX_DIRECTORY_DEPTH,
} from "@/core/domain/directory/valueObject";
import { BusinessRuleError } from "@/core/domain/error";
import { UserId } from "@/core/domain/identity/valueObject";
import { type DirectoryDTO, toDirectoryDTO } from "../dto/directory";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type MoveDirectoryInput = {
  actorUserId: string;
  directoryId: string;
  newParentId: string | null;
};

export type MoveDirectoryOutput = {
  directory: DirectoryDTO;
};

export async function moveDirectory({
  container,
  input,
}: ServiceArgs<MoveDirectoryInput>): Promise<MoveDirectoryOutput> {
  const now = container.clock.now();
  const actorUserId = UserId.create(input.actorUserId);
  const directoryId = DirectoryId.create(input.directoryId);

  const next = await container.unitOfWorkProvider.run(
    async ({ directoryRepository }) => {
      const found = await directoryRepository.findById(directoryId);
      if (found === null) {
        throw new NotFoundError(
          "DIRECTORY_NOT_FOUND",
          `Directory not found: ${directoryId}`,
        );
      }
      const dir = found.entity;

      if (dir.ownerId !== actorUserId) {
        throw new ForbiddenError(
          "DIRECTORY_FORBIDDEN",
          "Cannot move another user's directory",
        );
      }

      if (Directory.isRoot(dir)) {
        throw new BusinessRuleError(
          DirectoryErrorCode.CannotMoveRoot,
          "Cannot move the root directory",
        );
      }

      const newParent =
        input.newParentId === null
          ? await DirectoryService.ensureRoot(
              actorUserId,
              now,
              container.idGenerator,
              directoryRepository,
            )
          : await (async () => {
              const newParentId = DirectoryId.create(
                input.newParentId as string,
              );
              const parentFound =
                await directoryRepository.findById(newParentId);
              if (parentFound === null) {
                throw new NotFoundError(
                  "DIRECTORY_NOT_FOUND",
                  `Directory not found: ${newParentId}`,
                );
              }
              return parentFound.entity;
            })();

      if (newParent.ownerId !== actorUserId) {
        throw new ForbiddenError(
          "DIRECTORY_FORBIDDEN",
          "Cannot move under another user's directory",
        );
      }

      await DirectoryService.assertNotCyclicMove(
        dir,
        newParent,
        directoryRepository,
      );

      await DirectoryService.assertSiblingNameUnique(
        newParent.id,
        actorUserId,
        dir.name,
        dir.id,
        directoryRepository,
      );

      if ((newParent.depth as number) + 1 > MAX_DIRECTORY_DEPTH) {
        throw new BusinessRuleError(
          DirectoryErrorCode.TooDeep,
          `Directory depth exceeds maximum (${MAX_DIRECTORY_DEPTH})`,
        );
      }

      const moved = Directory.moveTo(dir, newParent, now);
      await directoryRepository.save(moved, found.expectedVersion);

      // Recompute depth for every descendant so the invariant
      // `depth = parent.depth + 1` holds across the moved subtree. We
      // walk children breadth-first; each `recomputeDepth` call rejects
      // a depth that would exceed the cap, so a move that pushes some
      // descendant past `MAX_DIRECTORY_DEPTH` aborts the UoW here.
      await recomputeDescendantDepths(moved, now, directoryRepository);

      return moved;
    },
  );

  return { directory: toDirectoryDTO(next) };
}

async function recomputeDescendantDepths(
  parent: Directory,
  now: Date,
  repo: DirectoryRepository,
): Promise<void> {
  const queue: Directory[] = [parent];
  while (queue.length > 0) {
    const node = queue.shift();
    if (node === undefined) break;
    const children = await repo.findChildren(node.id);
    for (const child of children) {
      if (!Directory.isChild(child)) continue;
      const versioned = await repo.findById(child.id);
      if (versioned === null) continue;
      const childEntity = versioned.entity;
      if (!Directory.isChild(childEntity)) continue;
      const expected = DirectoryDepth.next(node.depth);
      if ((childEntity.depth as number) === (expected as number)) {
        // Depth already correct (no parent change here); still need to
        // walk its descendants because the parent above may have moved.
        queue.push(childEntity);
        continue;
      }
      const next: ChildDirectory = Directory.recomputeDepth(
        childEntity,
        node.depth,
        now,
      );
      await repo.save(next, versioned.expectedVersion);
      queue.push(next);
    }
  }
}
