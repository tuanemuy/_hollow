import { BusinessRuleError } from "@/core/domain/error";
import type {
  MediaAssetId as IdentityMediaAssetId,
  UserId,
} from "@/core/domain/identity/valueObject";
import type { MediaAssetRepository } from "@/core/domain/media/ports/mediaAssetRepository";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import { NoteErrorCode } from "@/core/domain/note/errorCode";
import type { NoteId } from "@/core/domain/note/valueObject";
import { PublicationState } from "@/core/domain/publication/entity";
import type { PublicationStateRepository } from "@/core/domain/publication/ports/publicationStateRepository";
import { PublicationService } from "@/core/domain/publication/service";
import type { ServiceArgs } from "../types";
import { loadOwnedNote } from "./internal";
import { type PublicationStateDTO, toPublicationStateDTO } from "./view";

export type Visibility = "private" | "unlisted" | "public";

export type ChangePublicationVisibilityInput = Readonly<{
  actorUserId: UserId;
  noteId: NoteId;
  nextVisibility: Visibility;
}>;

export type ChangePublicationVisibilityOutput = Readonly<{
  state: PublicationStateDTO;
}>;

/**
 * Transition a note's publication visibility.
 *
 * Read-then-write flows participate in a single UoW:
 * - Note ownership / active-status check
 * - PublicationState load (or default-create on first publish)
 * - For a `public` transition: media ownership check
 * - Service applies the transition and cascades link revocation when
 *   the new visibility is `private`. Persistence happens inside the
 *   service so the cascade and the state write land in the same batch.
 *
 * The service-returned drafts (state-change + cascading link revokes)
 * are funnelled through `collectEvents` for outbox delivery.
 */
export async function changePublicationVisibility({
  container,
  input,
}: ServiceArgs<ChangePublicationVisibilityInput>): Promise<ChangePublicationVisibilityOutput> {
  const now = container.clock.now();

  const next = await container.unitOfWorkProvider.run(
    async ({
      noteRepository,
      publicationStateRepository,
      shareLinkRepository,
      mediaAssetRepository,
      collectEvents,
    }) => {
      const note = await loadOwnedNote(
        noteRepository,
        input.noteId,
        input.actorUserId,
      );
      if (note.status !== "active") {
        throw new BusinessRuleError(
          NoteErrorCode.Trashed,
          `Note ${input.noteId} is trashed; cannot change publication visibility`,
        );
      }

      const current = await loadOrCreateState(
        publicationStateRepository,
        note.id,
        input.actorUserId,
        now,
      );

      if (input.nextVisibility === "public") {
        const owned = await ownedMediaIds(
          mediaAssetRepository,
          note.mediaRefs,
          input.actorUserId,
        );
        // `PublicationState.assertCanPublish` is typed against
        // identity's `MediaAssetId` brand while `Note.mediaRefs` carries
        // media's. The two brands are structurally identical strings —
        // the cast is the one boundary where the two domain views meet.
        PublicationState.assertCanPublish(
          new Set(
            note.mediaRefs,
          ) as unknown as ReadonlySet<IdentityMediaAssetId>,
          owned as unknown as ReadonlySet<IdentityMediaAssetId>,
        );
      }

      const { entity: nextState, eventDrafts } =
        await PublicationService.changeVisibilityAndCascade(
          current,
          input.nextVisibility,
          now,
          {
            pubRepo: publicationStateRepository,
            linkRepo: shareLinkRepository,
          },
        );

      if (eventDrafts.length > 0) {
        collectEvents(eventDrafts);
      }

      return nextState;
    },
  );

  return { state: toPublicationStateDTO(next) };
}

async function loadOrCreateState(
  repo: PublicationStateRepository,
  noteId: NoteId,
  ownerId: UserId,
  now: Date,
) {
  const existing = await repo.findById(noteId);
  if (existing !== null) return existing.entity;
  return PublicationState.create({ noteId, ownerId }, now);
}

async function ownedMediaIds(
  repo: MediaAssetRepository,
  used: readonly MediaAssetId[],
  ownerId: UserId,
): Promise<ReadonlySet<MediaAssetId>> {
  if (used.length === 0) return new Set();
  const assets = await repo.findByIds(used);
  const ownedIds = new Set<MediaAssetId>();
  for (const asset of assets) {
    if (asset.ownerId === ownerId) {
      ownedIds.add(asset.id);
    }
  }
  return ownedIds;
}
