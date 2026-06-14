import { UserId } from "@/core/domain/identity/valueObject";
import type { AccountDeletionImpactDTO } from "../dto/identity";
import type { ServiceArgs } from "../types";

export type SummarizeAccountDeletionInput = Readonly<{
  actorUserId: string;
}>;

/**
 * Read-only aggregation of what an account deletion affects, for the P24
 * confirm UI. Structurally a `listNotesByOwner`-style usecase: it reads
 * repositories inside `unitOfWorkProvider.run` (the only path to obtain
 * them — `RequestContainer` does not expose repositories directly) but
 * performs no writes and never `collectEvents`.
 *
 * Each value is faithful to the real delete cascade; see
 * {@link AccountDeletionImpactDTO} and `.issue/573/adr.md` ADR-003.
 */
export async function summarizeAccountDeletion({
  container,
  input,
}: ServiceArgs<SummarizeAccountDeletionInput>): Promise<AccountDeletionImpactDTO> {
  const actor = UserId.create(input.actorUserId);

  return container.unitOfWorkProvider.run(
    async ({
      noteRepository,
      mediaAssetRepository,
      publicationStateRepository,
      shareLinkRepository,
    }) => {
      const [noteCount, media, publicNoteCount, activeShareLinkCount] =
        await Promise.all([
          noteRepository.countByOwner(actor, { status: "active" }),
          mediaAssetRepository.aggregateByOwner(actor),
          publicationStateRepository.countPublicByOwner(actor),
          shareLinkRepository.countActiveByOwner(actor),
        ]);

      return {
        noteCount,
        mediaCount: media.count,
        mediaTotalBytes: media.totalBytes,
        publicNoteCount,
        activeShareLinkCount,
      };
    },
  );
}
