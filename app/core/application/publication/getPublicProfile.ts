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
 * from `PublicationStateRepository.countPublicByOwner`, which counts over
 * the `active`-note population (excluding the trash → relay lag's
 * trashed-but-public rows) with no `limit`, so the hero count stays
 * consistent with the page's listing total.
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
      const publicNoteCount =
        await publicationStateRepository.countPublicByOwner(user.id);
      return {
        user: toUserDTO(user),
        publicNoteCount,
      };
    },
  );
}
