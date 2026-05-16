import {
  type BacklinkDTO,
  type InternalLinkRefDTO,
  type NoteDTO,
  type NoteId,
  type NoteListItemDTO,
  toInternalLinkRefDTO,
  toNoteDTO,
} from "@/core/application/dto";
import type { DirectoryId } from "@/core/application/dto/directory";
import type { TagId } from "@/core/application/dto/tag";
import type { Note } from "@/core/domain/note/entity";

export type { BacklinkDTO, InternalLinkRefDTO, NoteDTO, NoteListItemDTO };

/**
 * Project a `Note` aggregate to its `NoteDTO` wire shape. Thin wrapper
 * over the common DTO helper so usecases in this module can `import {
 * toNoteView }` for symmetry with `toTodoView` etc.
 */
export const toNoteView = (note: Note): NoteDTO => toNoteDTO(note);

/**
 * Build the listing-projection of `Note` for owner-scoped queries.
 * `excerpt` / `thumbnailUrl` / `tagNames` / `visibility` are not carried
 * by the aggregate; callers supply them from the surrounding listing
 * pipeline (tag-name join, sanitized excerpt, publication state).
 */
export function toNoteListItem(
  note: Note,
  context: Readonly<{
    excerpt: string;
    thumbnailUrl: string | null;
    tagNames: readonly string[];
    visibility: "private" | "unlisted" | "public";
  }>,
): NoteListItemDTO {
  return {
    id: note.id as unknown as NoteId,
    ownerId: note.ownerId as unknown as NoteListItemDTO["ownerId"],
    directoryId: note.directoryId as unknown as DirectoryId,
    slug: note.slug,
    title: note.title,
    excerpt: context.excerpt,
    thumbnailUrl: context.thumbnailUrl,
    tagIds: note.tagIds.map((id) => id as unknown as TagId),
    tagNames: context.tagNames,
    updatedAt: note.updatedAt.toISOString(),
    visibility: context.visibility,
  };
}

/**
 * Backlink projection for `GetBacklinks` / `GetNoteDetail`. The source
 * `Note` is always an active referrer; trashed notes are filtered out by
 * the repository.
 */
export function toBacklink(note: Note): BacklinkDTO {
  return {
    noteId: note.id as unknown as NoteId,
    title: note.title,
    slug: note.slug,
  };
}

export { toInternalLinkRefDTO, toNoteDTO };
