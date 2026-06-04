import { Username } from "@/core/domain/identity/valueObject";
import { NoteId as NoteIdVO, NoteSlug } from "@/core/domain/note/valueObject";
import type { TagId as TagIdVO } from "@/core/domain/tag/valueObject";
import { toUserDTO, type UserDTO } from "../dto/identity";
import type { NoteDTO } from "../dto/note";
import { NotFoundError } from "../errors";
import { toNoteView } from "../note/view";
import type { ServiceArgs } from "../types";

export type GetPublicNoteInput =
  | Readonly<{
      kind: "bySlug";
      username: string;
      slug: string;
    }>
  | Readonly<{
      kind: "byId";
      noteId: string;
    }>;

export type GetPublicNoteOutput = Readonly<{
  note: NoteDTO;
  owner: UserDTO;
  tagNames: readonly string[];
  publishedAt: Date | null;
}>;

/**
 * Public-facing note read. Resolves either a `(username, slug)` pair or
 * a direct `noteId` to the underlying note + owner DTOs, gated on:
 *
 * - the owner is live (`status` neither `deleted` nor `suspended`)
 * - the note is active (`status === 'active'`)
 * - the note's `PublicationState.visibility === 'public'`
 *
 * Any failing gate is surfaced as `NotFoundError` so the public surface
 * cannot distinguish "missing" from "private" — preventing enumeration.
 * Trashed / unlisted / private notes are not exposed through this path;
 * the share-link route handles the unlisted case separately.
 */
export async function getPublicNote({
  container,
  input,
}: ServiceArgs<GetPublicNoteInput>): Promise<GetPublicNoteOutput> {
  return container.unitOfWorkProvider.run(
    async ({
      userRepository,
      noteRepository,
      publicationStateRepository,
      tagRepository,
    }) => {
      const { note, owner } = await (async () => {
        if (input.kind === "bySlug") {
          const username = Username.create(input.username);
          const slug = NoteSlug.create(input.slug);
          const userFound = await userRepository.findByUsername(username);
          if (userFound === null) {
            throw new NotFoundError(
              "note",
              `User not found: ${input.username}`,
            );
          }
          if (
            userFound.status === "deleted" ||
            userFound.status === "suspended"
          ) {
            throw new NotFoundError(
              "note",
              `User not available: ${input.username}`,
            );
          }
          const noteFound = await noteRepository.findByOwnerAndSlug(
            userFound.id,
            slug,
          );
          if (noteFound === null) {
            throw new NotFoundError(
              "note",
              `Note not found: ${input.username}/${input.slug}`,
            );
          }
          return { note: noteFound, owner: userFound };
        }
        const noteId = NoteIdVO.create(input.noteId);
        const versioned = await noteRepository.findById(noteId);
        if (versioned === null) {
          throw new NotFoundError("note", `Note not found: ${input.noteId}`);
        }
        const ownerFound = await userRepository.findById(
          versioned.entity.ownerId,
        );
        if (ownerFound === null) {
          throw new NotFoundError(
            "note",
            `Owner not found for note: ${input.noteId}`,
          );
        }
        if (
          ownerFound.entity.status === "deleted" ||
          ownerFound.entity.status === "suspended"
        ) {
          throw new NotFoundError(
            "note",
            `Owner not available for note: ${input.noteId}`,
          );
        }
        return { note: versioned.entity, owner: ownerFound.entity };
      })();

      if (note.status !== "active") {
        throw new NotFoundError("note", `Note is not active: ${note.id}`);
      }

      const stateLookup = await publicationStateRepository.findById(note.id);
      const visibility = stateLookup?.entity.visibility ?? "private";
      if (visibility !== "public") {
        throw new NotFoundError("note", `Note is not public: ${note.id}`);
      }
      const publishedAt = stateLookup?.entity.publishedAt ?? null;

      const tags =
        note.tagIds.length === 0
          ? []
          : await tagRepository.findByIds(
              note.tagIds.map((id) => id as TagIdVO),
            );
      const tagNameMap = new Map<string, string>(
        tags.map((t) => [t.id, t.name as string]),
      );
      const tagNames = note.tagIds
        .map((id) => tagNameMap.get(id))
        .filter((name): name is string => name !== undefined);

      return {
        note: toNoteView(note),
        owner: toUserDTO(owner),
        tagNames,
        publishedAt,
      };
    },
  );
}
