import { BusinessRuleError } from "@/core/domain/error";
import { User } from "@/core/domain/identity/entity";
import { IdentityErrorCode } from "@/core/domain/identity/errorCode";
import {
  MediaAssetId as IdentityMediaAssetId,
  UserId,
} from "@/core/domain/identity/valueObject";
import { MediaAsset } from "@/core/domain/media/entity";
import { MediaAssetId as MediaDomainAssetId } from "@/core/domain/media/valueObject";
import type { UserDTO } from "../dto/identity";
import { toUserDTO } from "../dto/identity";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

/**
 * `displayName` / `bio` / `avatarMediaId` are tri-state on the wire:
 * - omitted (`undefined`) → leave the existing value alone
 * - explicit `null` → clear (only meaningful for `bio` and `avatarMediaId`)
 * - explicit string / id → set to the new value
 *
 * TanStack Start's `validateSearch` / `inputValidator` distinguish
 * missing vs `null` natively, so the usecase mirrors that distinction.
 */
export type UpdateProfileInput = {
  actorUserId: string;
  displayName?: string;
  bio?: string | null;
  avatarMediaId?: string | null;
};

export type UpdateProfileOutput = {
  user: UserDTO;
};

export async function updateProfile({
  container,
  input,
}: ServiceArgs<UpdateProfileInput>): Promise<UpdateProfileOutput> {
  const now = container.clock.now();
  const actor = UserId.create(input.actorUserId);

  const updated = await container.unitOfWorkProvider.run(
    async ({ userRepository, mediaAssetRepository }) => {
      const found = await userRepository.findById(actor);
      if (found === null) {
        throw new NotFoundError("user", `User not found: ${actor}`);
      }
      let user = found.entity;
      const previousAvatarId = user.avatarMediaId;

      // -- avatar swap (handled first so VO failures surface before
      //    any other field changes). The Media domain owns ref-count
      //    semantics; we only orchestrate the ID swap on the User
      //    aggregate side.
      if (input.avatarMediaId !== undefined) {
        // Two-brand bridge: Identity's `avatarMediaId` is a pointer to
        // a Media-owned asset, but the two domains each declare their
        // own `MediaAssetId` brand (Identity has no dependency on the
        // Media module's symbol). The string identity is the same, so
        // the usecase narrows once at the boundary by re-constructing
        // the value through each side's factory.
        const nextAvatarIdMedia =
          input.avatarMediaId === null
            ? null
            : MediaDomainAssetId.create(input.avatarMediaId);
        const nextAvatarIdIdentity =
          input.avatarMediaId === null
            ? null
            : IdentityMediaAssetId.create(input.avatarMediaId);

        if (nextAvatarIdMedia !== null) {
          const asset = await mediaAssetRepository.findById(nextAvatarIdMedia);
          if (asset === null) {
            throw new BusinessRuleError(
              IdentityErrorCode.MediaNotOwned,
              "Avatar media asset not found",
            );
          }
          if (asset.ownerId !== actor) {
            throw new BusinessRuleError(
              IdentityErrorCode.MediaNotOwned,
              "Avatar media asset is not owned by actor",
            );
          }
          if (!MediaAsset.isPending(asset) && !MediaAsset.isAttached(asset)) {
            throw new BusinessRuleError(
              IdentityErrorCode.MediaNotOwned,
              "Avatar media asset is no longer usable",
            );
          }
          const incremented = MediaAsset.incrementRef(asset, now);
          await mediaAssetRepository.save(incremented.entity);
        }

        if (
          previousAvatarId !== null &&
          previousAvatarId !== nextAvatarIdIdentity
        ) {
          const previousAvatarIdMedia =
            MediaDomainAssetId.create(previousAvatarId);
          const oldAsset = await mediaAssetRepository.findById(
            previousAvatarIdMedia,
          );
          if (
            oldAsset !== null &&
            (MediaAsset.isAttached(oldAsset) || MediaAsset.isPending(oldAsset))
          ) {
            const decremented = MediaAsset.decrementRef(oldAsset, now);
            await mediaAssetRepository.save(decremented.entity);
          }
        }

        user = User.changeAvatar(user, nextAvatarIdIdentity, now);
      }

      if (input.displayName !== undefined) {
        user = User.changeDisplayName(user, input.displayName, now);
      }
      if (input.bio !== undefined) {
        user = User.changeBio(user, input.bio, now);
      }

      // Only persist if the aggregate actually mutated. Each
      // `changeX` returns the same reference when the input matches
      // the current value, so identity equality is a sufficient
      // "no-op" check.
      if (user !== found.entity) {
        await userRepository.save(user, found.expectedVersion);
      }
      return user;
    },
  );

  return { user: toUserDTO(updated) };
}
