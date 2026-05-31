import type { Note } from "@/core/domain/note/entity";
import type { NoteRevision } from "@/core/domain/note/revision";
import type { InternalLinkRef } from "@/core/domain/note/valueObject";
import type { Instant } from "./common";
import { toInstant, toInstantOrNull } from "./common";
import type { DirectoryId } from "./directory";
import type { MediaAssetId, UserId } from "./identity";
import type { TagId } from "./tag";

export type NoteId = string & { readonly __brand: "NoteId" };
export type NoteRevisionId = string & { readonly __brand: "NoteRevisionId" };

/** Plain-record projection of the domain `FrontMatter` value object. */
export type FrontMatterDTO = Record<string, unknown>;

/**
 * Structured representation of an inline `[[...]]` reference rendered in
 * a note body. The DTO drops the domain's `resolvedNoteId` field because
 * the discriminator already carries the resolution shape:
 *   - `kind === 'id'`   ⇒ `target` is a `NoteId` (already resolved).
 *   - `kind === 'title'` ⇒ `target` is the raw title string.
 */
export type InternalLinkRefDTO =
  | Readonly<{ kind: "id"; target: NoteId; displayText: string | null }>
  | Readonly<{ kind: "title"; target: string; displayText: string | null }>;

export type NoteDTO = Readonly<{
  id: NoteId;
  ownerId: UserId;
  directoryId: DirectoryId;
  slug: string;
  title: string;
  contentHtml: string;
  frontMatter: FrontMatterDTO;
  tagIds: readonly TagId[];
  internalLinkRefs: readonly InternalLinkRefDTO[];
  mediaRefs: readonly MediaAssetId[];
  status: "active" | "trashed";
  trashedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
  editLock: Readonly<{ userId: UserId; expiresAt: Instant }> | null;
}>;

export type NoteListItemDTO = Readonly<{
  id: NoteId;
  ownerId: UserId;
  directoryId: DirectoryId;
  slug: string;
  title: string;
  excerpt: string;
  tagIds: readonly TagId[];
  tagNames: readonly string[];
  updatedAt: Instant;
  visibility: "private" | "unlisted" | "public";
}>;

export type BacklinkDTO = Readonly<{
  noteId: NoteId;
  title: string;
  slug: string;
  snippet: string | null;
}>;

/**
 * List-projection of a `NoteRevision`. Drops the body to keep the listing
 * payload small — the detail page fetches the full revision separately
 * via `GetNoteRevision`.
 */
export type NoteRevisionSummaryDTO = Readonly<{
  id: NoteRevisionId;
  noteId: NoteId;
  title: string;
  createdAt: Instant;
  createdByUserId: UserId;
}>;

/** Detail projection of a `NoteRevision` — carries the full snapshot. */
export type NoteRevisionDTO = Readonly<{
  id: NoteRevisionId;
  noteId: NoteId;
  ownerId: UserId;
  title: string;
  contentHtml: string;
  frontMatter: FrontMatterDTO;
  createdByUserId: UserId;
  createdAt: Instant;
}>;

export function toNoteRevisionSummaryDTO(
  revision: NoteRevision,
): NoteRevisionSummaryDTO {
  return {
    id: revision.id as unknown as NoteRevisionId,
    noteId: revision.noteId as unknown as NoteId,
    title: revision.title,
    createdAt: toInstant(revision.createdAt),
    createdByUserId: revision.createdByUserId as unknown as UserId,
  };
}

export function toNoteRevisionDTO(revision: NoteRevision): NoteRevisionDTO {
  return {
    id: revision.id as unknown as NoteRevisionId,
    noteId: revision.noteId as unknown as NoteId,
    ownerId: revision.ownerId as unknown as UserId,
    title: revision.title,
    contentHtml: revision.contentHtml,
    frontMatter: { ...revision.frontMatter } as FrontMatterDTO,
    createdByUserId: revision.createdByUserId as unknown as UserId,
    createdAt: toInstant(revision.createdAt),
  };
}

export function toInternalLinkRefDTO(ref: InternalLinkRef): InternalLinkRefDTO {
  if (ref.kind === "id") {
    return {
      kind: "id",
      // For kind=id the canonical target is the resolved note id when the
      // service has linked it; otherwise the raw target (already a
      // UUIDv7 by domain invariant).
      target: (ref.resolvedNoteId ?? ref.target) as unknown as NoteId,
      displayText: ref.displayText,
    };
  }
  return {
    kind: "title",
    target: ref.target,
    displayText: ref.displayText,
  };
}

export function toNoteDTO(note: Note): NoteDTO {
  return {
    id: note.id as unknown as NoteId,
    ownerId: note.ownerId as unknown as UserId,
    directoryId: note.directoryId as unknown as DirectoryId,
    slug: note.slug,
    title: note.title,
    contentHtml: note.contentHtml,
    frontMatter: { ...note.frontMatter } as FrontMatterDTO,
    tagIds: note.tagIds.map((id) => id as unknown as TagId),
    internalLinkRefs: note.internalLinkRefs.map(toInternalLinkRefDTO),
    mediaRefs: note.mediaRefs.map((id) => id as unknown as MediaAssetId),
    status: note.status,
    trashedAt: toInstantOrNull(note.trashedAt),
    createdAt: toInstant(note.createdAt),
    updatedAt: toInstant(note.updatedAt),
    editLock:
      note.editLock === null
        ? null
        : {
            userId: note.editLock.userId as unknown as UserId,
            expiresAt: toInstant(note.editLock.expiresAt),
          },
  };
}
