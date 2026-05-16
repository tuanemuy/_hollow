import { Directory } from "@/core/domain/directory/entity";
import { DirectoryErrorCode } from "@/core/domain/directory/errorCode";
import { DirectoryService } from "@/core/domain/directory/service";
import {
  DirectoryId,
  DirectoryName,
  MAX_DIRECTORY_DEPTH,
} from "@/core/domain/directory/valueObject";
import { BusinessRuleError } from "@/core/domain/error";
import { UserId } from "@/core/domain/identity/valueObject";
import { type DirectoryDTO, toDirectoryDTO } from "../dto/directory";
import { ForbiddenError, NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type CreateDirectoryInput = {
  actorUserId: string;
  parentId: string | null;
  name: string;
};

export type CreateDirectoryOutput = {
  directory: DirectoryDTO;
};

export async function createDirectory({
  container,
  input,
}: ServiceArgs<CreateDirectoryInput>): Promise<CreateDirectoryOutput> {
  const now = container.clock.now();
  const actorUserId = UserId.create(input.actorUserId);
  const name = DirectoryName.create(input.name);
  const id = container.idGenerator.next();

  const created = await container.unitOfWorkProvider.run(
    async ({ directoryRepository }) => {
      const parent =
        input.parentId === null
          ? await DirectoryService.ensureRoot(
              actorUserId,
              now,
              container.idGenerator,
              directoryRepository,
            )
          : await (async () => {
              const parentId = DirectoryId.create(input.parentId as string);
              const found = await directoryRepository.findById(parentId);
              if (found === null) {
                throw new NotFoundError(
                  "DIRECTORY_NOT_FOUND",
                  `Directory not found: ${parentId}`,
                );
              }
              return found.entity;
            })();

      if (parent.ownerId !== actorUserId) {
        throw new ForbiddenError(
          "DIRECTORY_FORBIDDEN",
          "Cannot create a directory under another user's parent",
        );
      }

      // Check depth cap before sibling-name lookup so a too-deep path
      // bails out without a wasted query. `Directory.create` re-validates
      // via `DirectoryDepth.next` and would throw the same error, but
      // doing it here keeps the failure message close to the spec.
      if ((parent.depth as number) + 1 > MAX_DIRECTORY_DEPTH) {
        throw new BusinessRuleError(
          DirectoryErrorCode.TooDeep,
          `Directory depth exceeds maximum (${MAX_DIRECTORY_DEPTH})`,
        );
      }

      await DirectoryService.assertSiblingNameUnique(
        parent.id,
        actorUserId,
        name,
        null,
        directoryRepository,
      );

      const directory = Directory.create(
        { id, ownerId: actorUserId, parent, name },
        now,
      );

      await directoryRepository.insert(directory);
      // No directory-level domain events today; downstream subsystems
      // discover new directories via the note events they later carry.
      return directory;
    },
  );

  return { directory: toDirectoryDTO(created) };
}
