import type { WithEventDrafts } from "@/core/domain/common/event";
import { Version } from "@/core/domain/common/version";
import { BusinessRuleError, RehydrationError } from "@/core/domain/error";
import type { MediaAssetId, UserId } from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import { PublicationErrorCode } from "./errorCode";
import { type PublicationEvent, PublicationEvents } from "./events";
import {
  PublicationVisibility,
  ShareLinkId,
  ShareLinkStatus,
  ShareLinkTokenHash,
  validateFailedAttempts,
} from "./valueObject";

// ---------------------------------------------------------------------------
// PublicationState (aggregate root, keyed by NoteId)
// ---------------------------------------------------------------------------

/**
 * Visibility record for one note. The note id is the aggregate id, so
 * `PublicationStateRepository.findByNoteId` is the OCC entry point and
 * downstream `save` carries the version captured there.
 *
 * Invariant: `visibility === 'private'` ⇒ `publishedAt === null`.
 */
export type PublicationState = Readonly<{
  noteId: NoteId;
  ownerId: UserId;
  visibility: PublicationVisibility;
  publishedAt: Date | null;
  updatedAt: Date;
  version: Version;
}>;

type PublicationStateReconstructInput = Readonly<{
  noteId: string;
  ownerId: string;
  visibility: string;
  publishedAt: Date | null;
  updatedAt: Date;
  version: number;
}>;

type PublicationStateCreateInput = Readonly<{
  noteId: string;
  ownerId: UserId;
}>;

function assertPrivatePublishedAtInvariant(
  visibility: PublicationVisibility,
  publishedAt: Date | null,
): void {
  if (visibility === "private" && publishedAt !== null) {
    throw new BusinessRuleError(
      PublicationErrorCode.InvariantPrivatePublishedAt,
      "Private publication state must have publishedAt === null",
    );
  }
}

function changeVisibility(
  state: PublicationState,
  next: PublicationVisibility,
  now: Date,
): WithEventDrafts<PublicationState, PublicationEvent> {
  if (state.visibility === next) {
    return { entity: state, eventDrafts: [] };
  }
  const publishedAt =
    next === "public"
      ? // Re-stamp `publishedAt` on every public transition so the most
        // recent publication is what the timeline reflects (an unlisted →
        // public flip should not surface the original private-window
        // timestamp from earlier in the note's lifetime).
        now
      : next === "private"
        ? null
        : state.publishedAt;
  const nextState: PublicationState = {
    ...state,
    visibility: next,
    publishedAt,
    updatedAt: now,
    version: Version.next(state.version),
  };
  return {
    entity: nextState,
    eventDrafts: [
      PublicationEvents.notePublishChanged(
        {
          noteId: nextState.noteId,
          ownerId: nextState.ownerId,
          previous: state.visibility,
          next,
        },
        now,
      ),
    ],
  };
}

/**
 * Pre-publish ownership check on the body's referenced media. The spec
 * states this in terms of the Note aggregate, but cross-aggregate
 * references are kept ID-only — so we receive the resolved id sets here
 * and the calling usecase is responsible for projecting them out of the
 * Note.
 *
 * `used` = `MediaAssetId`s that appear in the note body.
 * `ownedByOwner` = `MediaAssetId`s the publishing owner is known to own.
 * Any `used` id missing from `ownedByOwner` aborts the publish.
 */
function assertCanPublish(
  used: ReadonlySet<MediaAssetId>,
  ownedByOwner: ReadonlySet<MediaAssetId>,
): void {
  for (const id of used) {
    if (!ownedByOwner.has(id)) {
      throw new BusinessRuleError(
        PublicationErrorCode.MediaNotOwned,
        `Cannot publish: media asset ${id} is not owned by the publisher`,
      );
    }
  }
}

export const PublicationState = {
  create: (
    params: PublicationStateCreateInput,
    now: Date,
  ): PublicationState => ({
    noteId: NoteId.create(params.noteId),
    ownerId: params.ownerId,
    visibility: "private",
    publishedAt: null,
    updatedAt: now,
    version: Version.initial(),
  }),

  reconstruct: (input: PublicationStateReconstructInput): PublicationState => {
    try {
      const visibility = PublicationVisibility.create(input.visibility);
      assertPrivatePublishedAtInvariant(visibility, input.publishedAt);
      return {
        noteId: NoteId.create(input.noteId),
        ownerId: input.ownerId as UserId,
        visibility,
        publishedAt: input.publishedAt,
        updatedAt: input.updatedAt,
        version: Version.create(input.version),
      };
    } catch (error) {
      throw new RehydrationError(
        `Failed to rehydrate PublicationState (noteId=${input.noteId})`,
        error,
      );
    }
  },

  changeVisibility,

  assertCanPublish,
};

// ---------------------------------------------------------------------------
// ShareLink (aggregate root, keyed by ShareLinkId)
// ---------------------------------------------------------------------------

type ShareLinkBase = Readonly<{
  id: ShareLinkId;
  noteId: NoteId;
  ownerId: UserId;
  tokenHash: ShareLinkTokenHash;
  passwordHash: string | null;
  createdAt: Date;
  revokedAt: Date | null;
  lastAccessedAt: Date | null;
  failedAttempts: number;
  lockedUntil: Date | null;
  updatedAt: Date;
  version: Version;
}>;

/**
 * Live share link. Subject to password / lockout policy; `isOpen`
 * answers whether it can be opened at a given instant.
 */
export type ActiveShareLink = ShareLinkBase &
  Readonly<{ status: "active"; revokedAt: null }>;

/**
 * Terminal state. Re-activation is not permitted — issuing a new link is
 * the only way to restore share access.
 */
export type RevokedShareLink = ShareLinkBase &
  Readonly<{ status: "revoked"; revokedAt: Date }>;

export type ShareLink = ActiveShareLink | RevokedShareLink;

type ShareLinkCreateInput = Readonly<{
  id: string;
  noteId: NoteId;
  ownerId: UserId;
  tokenHash: string;
  passwordHash?: string | null;
}>;

type ShareLinkReconstructInput = Readonly<{
  id: string;
  noteId: string;
  ownerId: string;
  tokenHash: string;
  passwordHash: string | null;
  status: string;
  createdAt: Date;
  revokedAt: Date | null;
  lastAccessedAt: Date | null;
  failedAttempts: number;
  lockedUntil: Date | null;
  updatedAt: Date;
  version: number;
}>;

function assertNotRevoked(link: ShareLink): asserts link is ActiveShareLink {
  if (link.status === "revoked") {
    throw new BusinessRuleError(
      PublicationErrorCode.ShareLinkRevoked,
      `Share link ${link.id} is revoked; further mutation is not allowed`,
    );
  }
}

function revoke(
  link: ShareLink,
  now: Date,
): WithEventDrafts<RevokedShareLink, PublicationEvent> {
  assertNotRevoked(link);
  const next: RevokedShareLink = {
    ...link,
    status: "revoked",
    revokedAt: now,
    updatedAt: now,
    version: Version.next(link.version),
  };
  return {
    entity: next,
    eventDrafts: [
      PublicationEvents.shareLinkRevoked(
        next.id,
        next.noteId,
        next.ownerId,
        now,
      ),
    ],
  };
}

function setPassword(
  link: ShareLink,
  hash: string | null,
  now: Date,
): ActiveShareLink {
  assertNotRevoked(link);
  return {
    ...link,
    passwordHash: hash,
    updatedAt: now,
    version: Version.next(link.version),
  };
}

function recordAccess(link: ShareLink, now: Date): ActiveShareLink {
  assertNotRevoked(link);
  return {
    ...link,
    lastAccessedAt: now,
    updatedAt: now,
    version: Version.next(link.version),
  };
}

function recordFailedAttempt(
  link: ShareLink,
  now: Date,
  maxAttempts: number,
  lockDurationSec: number,
): ActiveShareLink {
  assertNotRevoked(link);
  const nextAttempts = link.failedAttempts + 1;
  const lockedUntil =
    nextAttempts >= maxAttempts
      ? new Date(now.getTime() + lockDurationSec * 1000)
      : link.lockedUntil;
  return {
    ...link,
    failedAttempts: nextAttempts,
    lockedUntil,
    updatedAt: now,
    version: Version.next(link.version),
  };
}

function resetFailedAttempts(link: ShareLink, now: Date): ActiveShareLink {
  assertNotRevoked(link);
  if (link.failedAttempts === 0 && link.lockedUntil === null) {
    return link;
  }
  return {
    ...link,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: now,
    version: Version.next(link.version),
  };
}

function isOpen(link: ShareLink, now: Date): boolean {
  if (link.status !== "active") return false;
  if (link.lockedUntil === null) return true;
  return link.lockedUntil.getTime() <= now.getTime();
}

export const ShareLink = {
  isActive: (link: ShareLink): link is ActiveShareLink =>
    link.status === "active",
  isRevoked: (link: ShareLink): link is RevokedShareLink =>
    link.status === "revoked",

  create: (
    params: ShareLinkCreateInput,
    now: Date,
  ): WithEventDrafts<ActiveShareLink, PublicationEvent> => {
    const link: ActiveShareLink = {
      id: ShareLinkId.create(params.id),
      noteId: params.noteId,
      ownerId: params.ownerId,
      tokenHash: ShareLinkTokenHash.create(params.tokenHash),
      passwordHash: params.passwordHash ?? null,
      status: "active",
      createdAt: now,
      revokedAt: null,
      lastAccessedAt: null,
      failedAttempts: 0,
      lockedUntil: null,
      updatedAt: now,
      version: Version.initial(),
    };
    return {
      entity: link,
      eventDrafts: [
        PublicationEvents.shareLinkIssued(
          link.id,
          link.noteId,
          link.ownerId,
          now,
        ),
      ],
    };
  },

  reconstruct: (input: ShareLinkReconstructInput): ShareLink => {
    try {
      const status = ShareLinkStatus.create(input.status);
      const base = {
        id: ShareLinkId.create(input.id),
        noteId: NoteId.create(input.noteId),
        ownerId: input.ownerId as UserId,
        tokenHash: ShareLinkTokenHash.create(input.tokenHash),
        passwordHash: input.passwordHash,
        createdAt: input.createdAt,
        lastAccessedAt: input.lastAccessedAt,
        failedAttempts: validateFailedAttempts(input.failedAttempts),
        lockedUntil: input.lockedUntil,
        updatedAt: input.updatedAt,
        version: Version.create(input.version),
      };
      if (status === "revoked") {
        if (input.revokedAt === null) {
          throw new BusinessRuleError(
            PublicationErrorCode.InvalidShareLinkStatus,
            "Revoked share link must have revokedAt set",
          );
        }
        return {
          ...base,
          status,
          revokedAt: input.revokedAt,
        } satisfies RevokedShareLink;
      }
      return {
        ...base,
        status,
        revokedAt: null,
      } satisfies ActiveShareLink;
    } catch (error) {
      throw new RehydrationError(
        `Failed to rehydrate ShareLink (id=${input.id})`,
        error,
      );
    }
  },

  revoke,

  setPassword,

  recordAccess,

  recordFailedAttempt,

  resetFailedAttempts,

  isOpen,
};
