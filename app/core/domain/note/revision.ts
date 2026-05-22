import { RehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import {
  ContentHtml,
  FrontMatter,
  type FrontMatterRecord,
  NoteId,
  NoteRevisionId,
  NoteTitle,
} from "./valueObject";

/**
 * Immutable snapshot of a `Note` taken at the time of a `SaveNote` call.
 *
 * `NoteRevision` is a child entity of the `Note` aggregate (ADR-001 of
 * Issue #158): it is append-only, has no behaviour beyond construction
 * / rehydration, and shares the `Note.save` transaction. The aggregate
 * deliberately does **not** snapshot the relational children
 * (`tagIds` / `internalLinkRefs` / `mediaRefs`) — when a revision is
 * restored, `NoteService.assembleFromInputs` re-extracts those from the
 * stored `contentHtml`, so the restored note is always consistent with
 * the current media-ownership / tag-blacklist policies (ADR-005).
 */
export type NoteRevision = Readonly<{
  id: NoteRevisionId;
  noteId: NoteId;
  ownerId: UserId;
  title: NoteTitle;
  contentHtml: ContentHtml;
  frontMatter: FrontMatter;
  createdByUserId: UserId;
  createdAt: Date;
}>;

type CreateInput = Readonly<{
  id: string;
  noteId: NoteId;
  ownerId: UserId;
  title: NoteTitle;
  contentHtml: ContentHtml;
  frontMatter: FrontMatter;
  createdByUserId: UserId;
}>;

// Loose-typed because adapters feed untrusted persistence rows; each
// field is re-validated through its value object inside `reconstruct`.
type ReconstructInput = Readonly<{
  id: string;
  noteId: string;
  ownerId: string;
  title: string;
  contentHtml: string;
  frontMatter: FrontMatterRecord;
  createdByUserId: string;
  createdAt: Date;
}>;

export const NoteRevision = {
  create: (params: CreateInput, now: Date): NoteRevision => ({
    id: NoteRevisionId.create(params.id),
    noteId: params.noteId,
    ownerId: params.ownerId,
    title: params.title,
    contentHtml: params.contentHtml,
    frontMatter: params.frontMatter,
    createdByUserId: params.createdByUserId,
    createdAt: now,
  }),

  // Value objects throw `BusinessRuleError` from their `create` paths to
  // signal "fresh input is invalid" at the usecase boundary. The same
  // failure during rehydration means stored data has drifted from the
  // schema, so wrap into `RehydrationError` — adapters translate it to
  // `SystemError(DataIntegrityError)`.
  reconstruct: (input: ReconstructInput): NoteRevision => {
    try {
      return {
        id: NoteRevisionId.create(input.id),
        noteId: NoteId.create(input.noteId),
        ownerId: input.ownerId as UserId,
        title: NoteTitle.create(input.title),
        contentHtml: ContentHtml.create(input.contentHtml),
        frontMatter: FrontMatter.create(input.frontMatter),
        createdByUserId: input.createdByUserId as UserId,
        createdAt: input.createdAt,
      };
    } catch (error) {
      throw new RehydrationError(
        `Failed to rehydrate NoteRevision (id=${input.id})`,
        error,
      );
    }
  },
};
