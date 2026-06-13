import { Username } from "@/core/domain/identity/valueObject";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type ListUserPublicTagsInput = Readonly<{ username: string }>;
export type ListUserPublicTagsOutput = Readonly<{
  tagNames: readonly string[];
}>;

// Upper bound on the public-tag master set enumerated for the P30
// filter-row's "+タグ" picker. Mirrors `listUserPublicNotes`'s
// `TAG_CANDIDATE_CAP`; tags are fewer than notes per owner, so this is far
// above any realistic single-owner public-tag count (ADR-002).
const PUBLIC_TAG_MASTER_CAP = 1000;

/**
 * Enumerates the owner-scoped master set of tag names attached to a user's
 * public, active notes — the candidate pool for the public profile page's
 * "+タグ" filter picker. The publication visibility gate is the enumeration
 * guard (resolved in the adapter's read-only JOIN): a tag attached only to
 * private/trashed notes never surfaces.
 *
 * Deleted / suspended users are treated as "no such author" (NotFoundError),
 * matching `listUserPublicNotes` / `getPublicProfile`.
 */
export async function listUserPublicTags({
  container,
  input,
}: ServiceArgs<ListUserPublicTagsInput>): Promise<ListUserPublicTagsOutput> {
  const username = Username.create(input.username);
  return container.unitOfWorkProvider.run(
    async ({ userRepository, tagRepository }) => {
      const user = await userRepository.findByUsername(username);
      if (user === null) {
        throw new NotFoundError("user", `User not found: ${input.username}`);
      }
      if (user.status === "deleted" || user.status === "suspended") {
        throw new NotFoundError(
          "user",
          `User not available: ${input.username}`,
        );
      }
      const tagNames = await tagRepository.listPublicTagNamesByOwner(
        user.id,
        PUBLIC_TAG_MASTER_CAP,
      );
      return { tagNames };
    },
  );
}
