import type { UserId } from "@/core/domain/identity/valueObject";
import { Username } from "@/core/domain/identity/valueObject";
import type { TagId as TagIdVO } from "@/core/domain/tag/valueObject";
import type { Instant } from "../dto/common";
import { toInstantOrNull } from "../dto/common";
import { NotFoundError } from "../errors";
import type { ServiceArgs } from "../types";

/**
 * Related public-note card projection for the P31 detail page. Carries
 * the note id (for the `/notes/public/$noteId` link), the title, the
 * first tag name, and the publication date — the fields the mock's
 * `related-card` renders.
 */
export type RelatedPublicNoteDTO = Readonly<{
  id: string;
  slug: string;
  title: string;
  tagNames: readonly string[];
  publishedAt: Instant | null;
}>;

export type ListRelatedPublicNotesInput =
  | Readonly<{
      kind: "byUsername";
      username: string;
      excludeNoteId: string;
      limit: number;
    }>
  | Readonly<{
      kind: "byOwnerId";
      ownerId: string;
      excludeNoteId: string;
      limit: number;
    }>;

export type ListRelatedPublicNotesOutput = Readonly<{
  notes: readonly RelatedPublicNoteDTO[];
}>;

/**
 * Lists other public notes by the same author for the P31 "同じ著者の
 * 他のノート" section. Reuses the {@link listUserPublicNotes} gate
 * (live owner + `visibility === 'public'`) but excludes the current note
 * and caps the result at `limit` cards. The publication date is resolved
 * from the publication aggregate so the card can show the 公開日.
 */
export async function listRelatedPublicNotes({
  container,
  input,
}: ServiceArgs<ListRelatedPublicNotesInput>): Promise<ListRelatedPublicNotesOutput> {
  return container.unitOfWorkProvider.run(
    async ({
      userRepository,
      publicationStateRepository,
      noteRepository,
      tagRepository,
    }) => {
      const ownerId: UserId = await (async () => {
        if (input.kind === "byUsername") {
          const username = Username.create(input.username);
          const user = await userRepository.findByUsername(username);
          if (user === null) {
            throw new NotFoundError(
              "user",
              `User not found: ${input.username}`,
            );
          }
          if (user.status === "deleted" || user.status === "suspended") {
            throw new NotFoundError(
              "user",
              `User not available: ${input.username}`,
            );
          }
          return user.id;
        }
        // `byOwnerId` trusts the caller to pass an already-live owner id
        // (ADR-007): unlike the `byUsername` path it performs no
        // deleted/suspended re-check, so the visibility gate is only as
        // strong as the live-owner guarantee at the call site (e.g.
        // `getPublicNote`, which resolves and validates the owner before
        // delegating here). Passing a non-live owner's id would leak that
        // author's public notes.
        return input.ownerId as UserId;
      })();

      const publicNoteIds = await publicationStateRepository.findPublicByOwner(
        ownerId,
        // Over-fetch so the post-filter (exclude current note, active-only)
        // still yields a full `limit`-sized page in the common case.
        { limit: 1000 },
      );
      const candidateIds = publicNoteIds.filter(
        (id) => (id as string) !== input.excludeNoteId,
      );
      if (candidateIds.length === 0) {
        return { notes: [] };
      }

      const states =
        await publicationStateRepository.findByNoteIds(candidateIds);
      const publishedAtById = new Map<string, Date | null>(
        states.map((s) => [s.noteId as string, s.publishedAt]),
      );

      const notes = await noteRepository.findByIds(candidateIds);
      const liveById = new Map<string, (typeof notes)[number]>(
        notes.filter((n) => n.status === "active").map((n) => [n.id, n]),
      );
      // Preserve `findPublicByOwner` ordering, drop trashed / missing, cap.
      const ordered = candidateIds
        .map((id) => liveById.get(id as string))
        .filter((n): n is NonNullable<typeof n> => n !== undefined)
        .slice(0, Math.max(0, input.limit));

      const allTagIds = new Set<string>();
      for (const note of ordered) {
        for (const id of note.tagIds) allTagIds.add(id);
      }
      const tagMap = new Map<string, string>();
      if (allTagIds.size > 0) {
        const tags = await tagRepository.findByIds(
          [...allTagIds].map((id) => id as TagIdVO),
        );
        for (const t of tags) tagMap.set(t.id, t.name as string);
      }

      const items = ordered.map((note) => {
        const tagNames = note.tagIds
          .map((id) => tagMap.get(id))
          .filter((name): name is string => name !== undefined);
        return {
          id: note.id,
          slug: note.slug,
          title: note.title,
          tagNames,
          publishedAt: toInstantOrNull(publishedAtById.get(note.id) ?? null),
        } satisfies RelatedPublicNoteDTO;
      });

      return { notes: items };
    },
  );
}
