import { BusinessRuleError } from "@/core/domain/error";
import { ExportJob } from "@/core/domain/export/entity";
import { User } from "@/core/domain/identity/entity";
import { IdentityService } from "@/core/domain/identity/services/identityService";
import { UserId } from "@/core/domain/identity/valueObject";
import { PublicationState } from "@/core/domain/publication/entity";
import type { UserId as UserIdDTO } from "../dto/identity";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

export type DeleteAccountInput = {
  actorUserId: UserIdDTO;
  /** Must equal the actor's username (case-sensitive). */
  confirmation: string;
};

// Page size used while iterating owner-scoped projections (public
// notes, in-progress export jobs). Sized to keep a single batch under
// the D1 row-fetch budget without making the cleanup walk too chatty.
const CLEANUP_PAGE_SIZE = 100;

export async function deleteAccount({
  container,
  input,
}: ServiceArgs<DeleteAccountInput>): Promise<void> {
  const now = container.clock.now();
  const actor = UserId.create(input.actorUserId);

  await container.unitOfWorkProvider.run(
    async ({
      userRepository,
      credentialStore,
      publicationStateRepository,
      exportJobRepository,
      collectEvents,
    }) => {
      const found = await userRepository.findById(actor);
      if (found === null) {
        throw new NotFoundError("user", `User not found: ${actor}`);
      }
      const user = found.entity;
      if (input.confirmation !== user.username) {
        throw new BusinessRuleError(
          "confirmation_mismatch",
          "Confirmation does not match username",
        );
      }
      if (user.role === "admin") {
        const adminCount = await userRepository.countAdmins();
        IdentityService.assertNotLastAdmin(actor, adminCount);
      }

      const { entity: deleted, eventDrafts } = User.markDeleted(user, now);
      await userRepository.save(deleted, found.expectedVersion);
      await credentialStore.purgeAll(actor);

      // -- unpublish every public note ----------------------------------
      // `findPublicByOwner` returns plain NoteIds; for each we need to
      // load the `PublicationState` aggregate (keyed by NoteId) to
      // capture an OCC token before flipping to `private`.
      let cursor: string | undefined;
      while (true) {
        const opts =
          cursor === undefined
            ? { limit: CLEANUP_PAGE_SIZE }
            : { limit: CLEANUP_PAGE_SIZE, cursor };
        const page = await publicationStateRepository.findPublicByOwner(
          actor,
          opts as Parameters<
            typeof publicationStateRepository.findPublicByOwner
          >[1],
        );
        if (page.length === 0) break;
        for (const noteId of page) {
          const pub = await publicationStateRepository.findById(noteId);
          if (pub === null) continue;
          if (pub.entity.visibility === "private") continue;
          const transitioned = PublicationState.changeVisibility(
            pub.entity,
            "private",
            now,
          );
          await publicationStateRepository.save(
            transitioned.entity,
            pub.expectedVersion,
          );
          collectEvents(transitioned.eventDrafts);
        }
        if (page.length < CLEANUP_PAGE_SIZE) break;
        cursor = page[page.length - 1];
      }

      // -- cancel in-progress export jobs --------------------------------
      let offset = 0;
      while (true) {
        const page = await exportJobRepository.findByOwner(actor, {
          limit: CLEANUP_PAGE_SIZE,
          offset,
        });
        if (page.length === 0) break;
        for (const job of page) {
          if (job.status !== "pending" && job.status !== "processing") {
            continue;
          }
          const versioned = await exportJobRepository.findById(job.id);
          if (versioned === null) continue;
          const live = versioned.entity;
          if (live.status !== "pending" && live.status !== "processing") {
            continue;
          }
          const cancelled = ExportJob.cancel(live, now);
          await exportJobRepository.save(
            cancelled.entity,
            versioned.expectedVersion,
          );
          collectEvents(cancelled.eventDrafts);
        }
        if (page.length < CLEANUP_PAGE_SIZE) break;
        offset += CLEANUP_PAGE_SIZE;
      }

      collectEvents(eventDrafts);
    },
  );

  // Sessions live outside the UoW (external token store); revoke after
  // the user state has been committed to `deleted`. Idempotent.
  await container.sessionService.revokeAllForUser(actor);
}
