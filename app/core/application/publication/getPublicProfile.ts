import { Username } from "@/core/domain/identity/valueObject";
import { toUserDTO, type UserDTO } from "../dto/identity";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type GetPublicProfileInput = Readonly<{
  username: string;
}>;

export type GetPublicProfileOutput = Readonly<{
  user: UserDTO;
  publicNoteCount: number;
}>;

/**
 * Public-facing profile read. Resolves a `username` to its owner profile
 * and returns the projection consumed by the user-public-top page.
 *
 * The lookup is rejected for deleted / suspended users so the public
 * surface treats them as "no such author". `publicNoteCount` is sourced
 * from `PublicationStateRepository.findPublicByOwner` and is the simple
 * cardinality of public notes — the catalogue size that the public page
 * surfaces in the hero header.
 */
export async function getPublicProfile({
  container,
  input,
}: ServiceArgs<GetPublicProfileInput>): Promise<GetPublicProfileOutput> {
  const username = Username.create(input.username);
  return container.unitOfWorkProvider.run(
    async ({ userRepository, publicationStateRepository }) => {
      const user = await userRepository.findByUsername(username);
      if (user === null) {
        throw new NotFoundError("user", `User not found: ${username}`);
      }
      if (user.status === "deleted" || user.status === "suspended") {
        throw new NotFoundError("user", `User not available: ${username}`);
      }
      const publicNotes = await publicationStateRepository.findPublicByOwner(
        user.id,
        { limit: 1000 },
      );
      return {
        user: toUserDTO(user),
        publicNoteCount: publicNotes.length,
      };
    },
  );
}
