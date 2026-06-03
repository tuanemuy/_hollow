import type { WithEventDrafts } from "@/core/domain/common/event";
import { Version } from "@/core/domain/common/version";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { BusinessRuleError, RehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { MediaAssetId } from "@/core/domain/media/valueObject";
import { TagId } from "@/core/domain/tag/valueObject";
import { NoteErrorCode } from "./errorCode";
import { type NoteEvent, NoteEvents } from "./events";
import {
  ContentHtml,
  EditLock,
  FrontMatter,
  type FrontMatterRecord,
  InternalLinkRef,
  type InternalLinkRef as InternalLinkRefType,
  NoteId,
  NoteSlug,
  NoteStatus,
  NoteTitle,
} from "./valueObject";

type NoteBase = Readonly<{
  id: NoteId;
  ownerId: UserId;
  directoryId: DirectoryId;
  slug: NoteSlug;
  title: NoteTitle;
  contentHtml: ContentHtml;
  frontMatter: FrontMatter;
  tagIds: readonly TagId[];
  internalLinkRefs: readonly InternalLinkRefType[];
  mediaRefs: readonly MediaAssetId[];
  editLock: EditLock | null;
  version: Version;
  createdAt: Date;
  updatedAt: Date;
}>;

/**
 * Active note (visible in the directory tree, editable). `trashedAt` is
 * always `null` while active.
 */
export type ActiveNote = NoteBase &
  Readonly<{ status: "active"; trashedAt: null }>;

/**
 * Trashed note. The original `directoryId` is preserved so `restore` can
 * return it to its previous location, but listing queries must filter
 * it out unless explicitly looking for trash.
 */
export type TrashedNote = NoteBase &
  Readonly<{ status: "trashed"; trashedAt: Date }>;

export type Note = ActiveNote | TrashedNote;

const dedupeTagIds = (ids: readonly TagId[]): readonly TagId[] => {
  const seen = new Set<string>();
  const out: TagId[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
};

const dedupeMediaIds = (
  ids: readonly MediaAssetId[],
): readonly MediaAssetId[] => {
  const seen = new Set<string>();
  const out: MediaAssetId[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
};

const dedupeLinks = (
  refs: readonly InternalLinkRefType[],
): readonly InternalLinkRefType[] => {
  const seen = new Set<string>();
  const out: InternalLinkRefType[] = [];
  for (const ref of refs) {
    const key = `${ref.kind}:${ref.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
};

const sameOrdered = <T>(
  a: readonly T[],
  b: readonly T[],
  eq: (x: T, y: T) => boolean,
): boolean => a.length === b.length && a.every((x, i) => eq(x, b[i]));

const assertEditPermitted = (
  note: Note,
  actorUserId: UserId,
  requireLock: boolean,
  now: Date,
): void => {
  const lock = note.editLock;
  const lockLive = lock !== null && EditLock.isLive(lock, now);
  if (requireLock) {
    if (!lockLive || lock === null || lock.userId !== actorUserId) {
      throw new BusinessRuleError(
        NoteErrorCode.EditLockedByOther,
        `Note ${note.id} is not held by ${actorUserId}`,
      );
    }
    return;
  }
  if (lockLive && lock !== null && lock.userId !== actorUserId) {
    throw new BusinessRuleError(
      NoteErrorCode.EditLockedByOther,
      `Note ${note.id} is currently locked by another user`,
    );
  }
};

function updateContent(
  note: Note,
  args: {
    title?: NoteTitle;
    contentHtml?: ContentHtml;
    frontMatter?: FrontMatter;
    tagIds?: readonly TagId[];
    internalLinkRefs?: readonly InternalLinkRefType[];
    mediaRefs?: readonly MediaAssetId[];
    now: Date;
    actorUserId: UserId;
    requireLock: boolean;
  },
): WithEventDrafts<Note, NoteEvent> {
  assertEditPermitted(note, args.actorUserId, args.requireLock, args.now);
  const nextTitle = args.title ?? note.title;
  const nextHtml = args.contentHtml ?? note.contentHtml;
  const nextFront = args.frontMatter ?? note.frontMatter;
  const nextTags =
    args.tagIds === undefined ? note.tagIds : dedupeTagIds(args.tagIds);
  const nextLinks =
    args.internalLinkRefs === undefined
      ? note.internalLinkRefs
      : dedupeLinks(args.internalLinkRefs);
  const nextMedia =
    args.mediaRefs === undefined
      ? note.mediaRefs
      : dedupeMediaIds(args.mediaRefs);
  // No-op when nothing changed: skip the version bump *and* the
  // `contentUpdated` event so identical re-saves (e.g. draft autosave
  // resending unchanged content) don't trigger link re-resolution or
  // re-indexing. Link refs are compared by kind+target only, matching
  // `InternalLinkRef.equals` — `resolvedNoteId` is set out-of-band by the
  // resolver and is intentionally excluded.
  if (
    NoteTitle.equals(note.title, nextTitle) &&
    ContentHtml.equals(note.contentHtml, nextHtml) &&
    FrontMatter.equals(note.frontMatter, nextFront) &&
    sameOrdered(note.tagIds, nextTags, (x, y) => x === y) &&
    sameOrdered(note.internalLinkRefs, nextLinks, InternalLinkRef.equals) &&
    sameOrdered(note.mediaRefs, nextMedia, (x, y) => x === y)
  ) {
    return { entity: note, eventDrafts: [] };
  }
  const next: Note =
    note.status === "active"
      ? ({
          ...note,
          title: nextTitle,
          contentHtml: nextHtml,
          frontMatter: nextFront,
          tagIds: nextTags,
          internalLinkRefs: nextLinks,
          mediaRefs: nextMedia,
          version: Version.next(note.version),
          updatedAt: args.now,
        } satisfies ActiveNote)
      : ({
          ...note,
          title: nextTitle,
          contentHtml: nextHtml,
          frontMatter: nextFront,
          tagIds: nextTags,
          internalLinkRefs: nextLinks,
          mediaRefs: nextMedia,
          version: Version.next(note.version),
          updatedAt: args.now,
        } satisfies TrashedNote);
  return {
    entity: next,
    eventDrafts: [
      NoteEvents.contentUpdated(
        {
          noteId: next.id,
          ownerId: next.ownerId,
          title: next.title,
          tagIds: next.tagIds,
          mediaRefs: next.mediaRefs,
        },
        args.now,
      ),
    ],
  };
}

function moveTo(
  note: Note,
  newDirectoryId: DirectoryId,
  now: Date,
): WithEventDrafts<ActiveNote, NoteEvent> {
  if (note.status !== "active") {
    throw new BusinessRuleError(
      NoteErrorCode.Trashed,
      `Cannot move trashed note ${note.id}`,
    );
  }
  if (note.directoryId === newDirectoryId) {
    return { entity: note, eventDrafts: [] };
  }
  const next: ActiveNote = {
    ...note,
    directoryId: newDirectoryId,
    version: Version.next(note.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [
      NoteEvents.moved(
        {
          noteId: next.id,
          ownerId: next.ownerId,
          fromDirectoryId: note.directoryId,
          toDirectoryId: newDirectoryId,
        },
        now,
      ),
    ],
  };
}

function rename(
  note: Note,
  newTitle: NoteTitle,
  newSlug: NoteSlug,
  now: Date,
): WithEventDrafts<Note, NoteEvent> {
  if (
    NoteTitle.equals(note.title, newTitle) &&
    NoteSlug.equals(note.slug, newSlug)
  ) {
    return { entity: note, eventDrafts: [] };
  }
  const next: Note =
    note.status === "active"
      ? ({
          ...note,
          title: newTitle,
          slug: newSlug,
          version: Version.next(note.version),
          updatedAt: now,
        } satisfies ActiveNote)
      : ({
          ...note,
          title: newTitle,
          slug: newSlug,
          version: Version.next(note.version),
          updatedAt: now,
        } satisfies TrashedNote);
  return {
    entity: next,
    eventDrafts: [
      NoteEvents.renamed(
        {
          noteId: next.id,
          ownerId: next.ownerId,
          title: newTitle,
          slug: newSlug,
        },
        now,
      ),
    ],
  };
}

function trash(note: Note, now: Date): WithEventDrafts<TrashedNote, NoteEvent> {
  if (note.status === "trashed") {
    throw new BusinessRuleError(
      NoteErrorCode.AlreadyTrashed,
      `Note ${note.id} is already trashed`,
    );
  }
  const next: TrashedNote = {
    ...note,
    status: "trashed",
    trashedAt: now,
    editLock: null,
    version: Version.next(note.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [
      NoteEvents.trashed(
        {
          noteId: next.id,
          ownerId: next.ownerId,
          mediaRefs: next.mediaRefs,
        },
        now,
      ),
    ],
  };
}

function restore(
  note: Note,
  newDirectoryId: DirectoryId | null,
  now: Date,
): WithEventDrafts<ActiveNote, NoteEvent> {
  if (note.status !== "trashed") {
    throw new BusinessRuleError(
      NoteErrorCode.NotTrashed,
      `Note ${note.id} is not trashed`,
    );
  }
  const directoryId = newDirectoryId ?? note.directoryId;
  const next: ActiveNote = {
    ...note,
    status: "active",
    trashedAt: null,
    directoryId,
    version: Version.next(note.version),
    updatedAt: now,
  };
  return {
    entity: next,
    eventDrafts: [
      NoteEvents.restored(
        {
          noteId: next.id,
          ownerId: next.ownerId,
          directoryId,
        },
        now,
      ),
    ],
  };
}

function acquireEditLock(
  note: Note,
  userId: UserId,
  now: Date,
  ttlSeconds: number,
): Note {
  const existing = note.editLock;
  if (
    existing !== null &&
    EditLock.isLive(existing, now) &&
    existing.userId !== userId
  ) {
    throw new BusinessRuleError(
      NoteErrorCode.EditLockedByOther,
      `Note ${note.id} is locked by another user`,
    );
  }
  const lock = EditLock.create({
    userId,
    acquiredAt: now,
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
  });
  return note.status === "active"
    ? ({
        ...note,
        editLock: lock,
        version: Version.next(note.version),
        updatedAt: now,
      } satisfies ActiveNote)
    : ({
        ...note,
        editLock: lock,
        version: Version.next(note.version),
        updatedAt: now,
      } satisfies TrashedNote);
}

function extendEditLock(
  note: Note,
  userId: UserId,
  now: Date,
  ttlSeconds: number,
): Note {
  const existing = note.editLock;
  if (existing === null || existing.userId !== userId) {
    throw new BusinessRuleError(
      NoteErrorCode.ExtendNotOwner,
      `Note ${note.id} edit lock is not held by ${userId}`,
    );
  }
  if (!EditLock.isLive(existing, now)) {
    throw new BusinessRuleError(
      NoteErrorCode.EditLockedByOther,
      `Note ${note.id} edit lock has expired`,
    );
  }
  const lock = EditLock.create({
    userId,
    acquiredAt: existing.acquiredAt,
    expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
  });
  return note.status === "active"
    ? ({
        ...note,
        editLock: lock,
        version: Version.next(note.version),
        updatedAt: now,
      } satisfies ActiveNote)
    : ({
        ...note,
        editLock: lock,
        version: Version.next(note.version),
        updatedAt: now,
      } satisfies TrashedNote);
}

function releaseEditLock(note: Note, userId: UserId): Note {
  if (note.editLock === null) {
    return note;
  }
  if (note.editLock.userId !== userId) {
    throw new BusinessRuleError(
      NoteErrorCode.ReleaseNotOwner,
      `Note ${note.id} edit lock is not held by ${userId}`,
    );
  }
  return note.status === "active"
    ? ({
        ...note,
        editLock: null,
      } satisfies ActiveNote)
    : ({
        ...note,
        editLock: null,
      } satisfies TrashedNote);
}

function replaceTags(
  note: Note,
  tagIds: readonly TagId[],
  now: Date,
): WithEventDrafts<Note, NoteEvent> {
  const nextTags = dedupeTagIds(tagIds);
  const previous = note.tagIds;
  const same =
    previous.length === nextTags.length &&
    previous.every((id, idx) => id === nextTags[idx]);
  if (same) {
    return { entity: note, eventDrafts: [] };
  }
  const next: Note =
    note.status === "active"
      ? ({
          ...note,
          tagIds: nextTags,
          version: Version.next(note.version),
          updatedAt: now,
        } satisfies ActiveNote)
      : ({
          ...note,
          tagIds: nextTags,
          version: Version.next(note.version),
          updatedAt: now,
        } satisfies TrashedNote);
  return {
    entity: next,
    eventDrafts: [
      NoteEvents.tagsReplaced(
        {
          noteId: next.id,
          ownerId: next.ownerId,
          previousTagIds: previous,
          tagIds: nextTags,
        },
        now,
      ),
    ],
  };
}

type CreateInput = Readonly<{
  id: string;
  ownerId: UserId;
  directoryId: DirectoryId;
  slug: NoteSlug;
  title: NoteTitle;
  contentHtml: ContentHtml;
  frontMatter: FrontMatter;
  tagIds: readonly TagId[];
  internalLinkRefs: readonly InternalLinkRefType[];
  mediaRefs: readonly MediaAssetId[];
}>;

// Loose-typed because adapters feed untrusted persistence rows; each
// field is re-validated through its value object inside `reconstruct`.
type ReconstructInput = Readonly<{
  id: string;
  ownerId: string;
  directoryId: string;
  slug: string;
  title: string;
  contentHtml: string;
  frontMatter: FrontMatterRecord;
  tagIds: readonly string[];
  internalLinkRefs: readonly {
    kind: string;
    target: string;
    resolvedNoteId: string | null;
    displayText: string | null;
  }[];
  mediaRefs: readonly string[];
  status: string;
  trashedAt: Date | null;
  editLock: {
    userId: string;
    acquiredAt: Date;
    expiresAt: Date;
  } | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}>;

export const Note = {
  isActive: (note: Note): note is ActiveNote => note.status === "active",
  isTrashed: (note: Note): note is TrashedNote => note.status === "trashed",

  create: (
    params: CreateInput,
    now: Date,
  ): WithEventDrafts<ActiveNote, NoteEvent> => {
    const note: ActiveNote = {
      id: NoteId.create(params.id),
      ownerId: params.ownerId,
      directoryId: params.directoryId,
      slug: params.slug,
      title: params.title,
      contentHtml: params.contentHtml,
      frontMatter: params.frontMatter,
      tagIds: dedupeTagIds(params.tagIds),
      internalLinkRefs: dedupeLinks(params.internalLinkRefs),
      mediaRefs: dedupeMediaIds(params.mediaRefs),
      status: "active",
      trashedAt: null,
      editLock: null,
      version: Version.initial(),
      createdAt: now,
      updatedAt: now,
    };
    return {
      entity: note,
      eventDrafts: [
        NoteEvents.created(
          {
            noteId: note.id,
            ownerId: note.ownerId,
            directoryId: note.directoryId,
            slug: note.slug,
            title: note.title,
            tagIds: note.tagIds,
            mediaRefs: note.mediaRefs,
          },
          now,
        ),
      ],
    };
  },

  // Value objects throw `BusinessRuleError` from their `create` paths to
  // signal "fresh input is invalid" at the usecase boundary. The same
  // failure during rehydration means stored data has drifted from the
  // schema, so wrap into `RehydrationError` — adapters translate it to
  // `SystemError(DataIntegrityError)`.
  reconstruct: (input: ReconstructInput): Note => {
    try {
      const status = NoteStatus.create(input.status);
      const base: NoteBase = {
        id: NoteId.create(input.id),
        ownerId: input.ownerId as UserId,
        directoryId: input.directoryId as DirectoryId,
        slug: NoteSlug.create(input.slug),
        title: NoteTitle.create(input.title),
        contentHtml: ContentHtml.create(input.contentHtml),
        frontMatter: FrontMatter.create(input.frontMatter),
        tagIds: dedupeTagIds(input.tagIds.map((id) => TagId.create(id))),
        internalLinkRefs: dedupeLinks(
          input.internalLinkRefs.map((ref) =>
            InternalLinkRef.create({
              kind: ref.kind === "id" ? "id" : "title",
              target: ref.target,
              resolvedNoteId:
                ref.resolvedNoteId === null
                  ? null
                  : NoteId.create(ref.resolvedNoteId),
              displayText: ref.displayText,
            }),
          ),
        ),
        mediaRefs: dedupeMediaIds(
          input.mediaRefs.map((id) => MediaAssetId.create(id)),
        ),
        editLock:
          input.editLock === null
            ? null
            : EditLock.create({
                userId: input.editLock.userId as UserId,
                acquiredAt: input.editLock.acquiredAt,
                expiresAt: input.editLock.expiresAt,
              }),
        version: Version.create(input.version),
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      };
      if (status === "active") {
        if (input.trashedAt !== null) {
          throw new BusinessRuleError(
            NoteErrorCode.InvalidStatus,
            "Active note must not have trashedAt",
          );
        }
        return { ...base, status, trashedAt: null } satisfies ActiveNote;
      }
      if (input.trashedAt === null) {
        throw new BusinessRuleError(
          NoteErrorCode.InvalidStatus,
          "Trashed note must have trashedAt",
        );
      }
      return {
        ...base,
        status,
        trashedAt: input.trashedAt,
      } satisfies TrashedNote;
    } catch (error) {
      throw new RehydrationError(
        `Failed to rehydrate Note (id=${input.id})`,
        error,
      );
    }
  },

  updateContent,
  moveTo,
  rename,
  trash,
  restore,
  acquireEditLock,
  extendEditLock,
  releaseEditLock,
  replaceTags,
};
