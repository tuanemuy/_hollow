import type { Note } from "@/core/domain/note/entity";
import type { NoteRevision } from "@/core/domain/note/revision";
import type { InternalLinkRef } from "@/core/domain/note/valueObject";
import type { Instant } from "./common";
import { toInstant, toInstantOrNull } from "./common";
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
  | Readonly<{ kind: "id"; target: string; displayText: string | null }>
  | Readonly<{ kind: "title"; target: string; displayText: string | null }>;

export type NoteDTO = Readonly<{
  id: string;
  ownerId: string;
  directoryId: string;
  slug: string;
  title: string;
  contentHtml: string;
  frontMatter: FrontMatterDTO;
  tagIds: readonly string[];
  internalLinkRefs: readonly InternalLinkRefDTO[];
  mediaRefs: readonly string[];
  status: "active" | "trashed";
  trashedAt: Instant | null;
  createdAt: Instant;
  updatedAt: Instant;
  editLock: Readonly<{ userId: string; expiresAt: Instant }> | null;
}>;

export type NoteListItemDTO = Readonly<{
  id: string;
  ownerId: string;
  directoryId: string;
  slug: string;
  title: string;
  excerpt: string;
  tagIds: readonly string[];
  tagNames: readonly string[];
  updatedAt: Instant;
  visibility: "private" | "unlisted" | "public";
}>;

export type BacklinkDTO = Readonly<{
  noteId: string;
  title: string;
  slug: string;
  snippet: string | null;
  /**
   * Root→leaf directory path of the referrer note, as `{ id, name }`
   * pairs (same structure the main-note breadcrumb uses). Empty for
   * root-level referrers. Presentation joins / uppercases for the
   * backlink card's meta line; the DTO keeps the raw names.
   */
  directorySegments: readonly { id: string; name: string }[];
}>;

/**
 * Projection of a note's persistent source file (the ingested original)
 * for the detail panel's 元ファイル section. The whole `sourceFile` is
 * `null` on notes without an ingestion source; when present, a source
 * file always carries the filename captured at ingestion upload.
 */
export type NoteSourceFileDTO = Readonly<{
  mediaId: string;
  originalFileName: string;
}>;

/**
 * List-projection of a `NoteRevision`. Drops the body to keep the listing
 * payload small — the detail page fetches the full revision separately
 * via `GetNoteRevision`.
 */
export type NoteRevisionSummaryDTO = Readonly<{
  id: string;
  noteId: string;
  title: string;
  createdAt: Instant;
  createdByUserId: string;
}>;

/** Detail projection of a `NoteRevision` — carries the full snapshot. */
export type NoteRevisionDTO = Readonly<{
  id: string;
  noteId: string;
  ownerId: string;
  title: string;
  contentHtml: string;
  frontMatter: FrontMatterDTO;
  createdByUserId: string;
  createdAt: Instant;
}>;

export function toNoteRevisionSummaryDTO(
  revision: NoteRevision,
): NoteRevisionSummaryDTO {
  return {
    id: revision.id,
    noteId: revision.noteId,
    title: revision.title,
    createdAt: toInstant(revision.createdAt),
    createdByUserId: revision.createdByUserId,
  };
}

export function toNoteRevisionDTO(revision: NoteRevision): NoteRevisionDTO {
  return {
    id: revision.id,
    noteId: revision.noteId,
    ownerId: revision.ownerId,
    title: revision.title,
    contentHtml: revision.contentHtml,
    frontMatter: { ...revision.frontMatter } as FrontMatterDTO,
    createdByUserId: revision.createdByUserId,
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
      target: ref.resolvedNoteId ?? ref.target,
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
    id: note.id,
    ownerId: note.ownerId,
    directoryId: note.directoryId,
    slug: note.slug,
    title: note.title,
    contentHtml: note.contentHtml,
    frontMatter: { ...note.frontMatter } as FrontMatterDTO,
    tagIds: note.tagIds,
    internalLinkRefs: note.internalLinkRefs.map(toInternalLinkRefDTO),
    mediaRefs: note.mediaRefs,
    status: note.status,
    trashedAt: toInstantOrNull(note.trashedAt),
    createdAt: toInstant(note.createdAt),
    updatedAt: toInstant(note.updatedAt),
    editLock:
      note.editLock === null
        ? null
        : {
            userId: note.editLock.userId,
            expiresAt: toInstant(note.editLock.expiresAt),
          },
  };
}
