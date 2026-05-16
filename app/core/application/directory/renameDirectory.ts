import { Directory } from "@/core/domain/directory/entity";
import { DirectoryErrorCode } from "@/core/domain/directory/errorCode";
import { DirectoryService } from "@/core/domain/directory/service";
import {
  DirectoryId,
  DirectoryName,
} from "@/core/domain/directory/valueObject";
import { BusinessRuleError } from "@/core/domain/error";
import { UserId } from "@/core/domain/identity/valueObject";
import { type DirectoryDTO, toDirectoryDTO } from "../dto/directory";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type RenameDirectoryInput = {
  actorUserId: string;
  directoryId: string;
  newName: string;
};

export type RenameDirectoryOutput = {
  directory: DirectoryDTO;
};

export async function renameDirectory({
  container,
  input,
}: ServiceArgs<RenameDirectoryInput>): Promise<RenameDirectoryOutput> {
  const now = container.clock.now();
  const actorUserId = UserId.create(input.actorUserId);
  const directoryId = DirectoryId.create(input.directoryId);
  const newName = DirectoryName.create(input.newName);

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
          "Cannot rename another user's directory",
        );
      }

      if (Directory.isRoot(dir)) {
        throw new BusinessRuleError(
          DirectoryErrorCode.CannotRenameRoot,
          "Cannot rename the root directory",
        );
      }

      await DirectoryService.assertSiblingNameUnique(
        dir.parentId,
        actorUserId,
        newName,
        dir.id,
        directoryRepository,
      );

      const renamed = Directory.rename(dir, newName, now);
      if (renamed === dir) {
        // No-op rename (same name) — skip the write so the version
        // does not bump unnecessarily.
        return dir;
      }
      await directoryRepository.save(renamed, found.expectedVersion);
      return renamed;
    },
  );

  return { directory: toDirectoryDTO(next) };
}
