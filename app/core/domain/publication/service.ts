import type {
  DomainEvent,
  EventDraft,
  WithEventDrafts,
} from "@/core/domain/common/event";
import { BusinessRuleError } from "@/core/domain/error";
import type { NoteId } from "@/core/domain/note/valueObject";
import { PublicationState, ShareLink } from "./entity";
import { PublicationErrorCode } from "./errorCode";
import type { PublicationEvent } from "./events";
import type { PasswordHasher } from "./ports/passwordHasher";
import type { PublicationStateRepository } from "./ports/publicationStateRepository";
import type { ShareLinkRepository } from "./ports/shareLinkRepository";
import type { PublicationVisibility } from "./valueObject";

const DEFAULT_LINK_QUOTA = 10;

/**
 * Outcome of a share-link verification attempt.
 *
 * `ok === true` is returned only after a successful password check (or
 * for a link without a password). In every case `updatedLink` is the
 * `ShareLink` value the caller must persist — the access record /
 * failure counter / lockout timestamp lives on the link aggregate, so
 * even a failed attempt produces a mutated entity that must be saved
 * so successive attempts converge on the lockout.
 *
 * `eventDrafts` carries the drafts that result from any state
 * transition the verification triggered (typically empty for the
 * common path; populated when policy needs to fire something).
 */
export type ShareLinkVerifyResult = Readonly<{
  ok: boolean;
  updatedLink: ShareLink;
  eventDrafts: readonly EventDraft<DomainEvent>[];
}>;

/**
 * Default lockout policy parameters used when `verifyShareLinkAccess`
 * needs to record a failure. Pulled out as a named record so the
 * adapter / usecase can override per deployment without changing the
 * service signature.
 */
export type ShareLinkLockoutPolicy = Readonly<{
  maxAttempts: number;
  lockDurationSec: number;
}>;

const DEFAULT_LOCKOUT_POLICY: ShareLinkLockoutPolicy = {
  // Tuned to make brute force impractical without locking out an
  // honest visitor who fat-fingered the password twice.
  maxAttempts: 5,
  lockDurationSec: 15 * 60,
};

/**
 * Apply a visibility change to a `PublicationState` and cascade any
 * side-effects that the new visibility implies:
 *
 * - moving to `private` revokes every active share link for the note
 *   (so the note is no longer reachable through any historical token)
 * - moving away from `unlisted` to `public` does **not** revoke links —
 *   they keep working as direct deep links into the now-public note,
 *   which is the friendlier UX
 *
 * Returns the new state plus every event draft (state transition +
 * cascading link revocations). The caller (usecase) is responsible for
 * `collectEvents(eventDrafts)` and for persisting the state via the
 * repository.
 */
async function changeVisibilityAndCascade(
  state: PublicationState,
  next: PublicationVisibility,
  now: Date,
  repos: Readonly<{
    pubRepo: PublicationStateRepository;
    linkRepo: ShareLinkRepository;
  }>,
): Promise<WithEventDrafts<PublicationState, PublicationEvent>> {
  const { entity: nextState, eventDrafts: stateDrafts } =
    PublicationState.changeVisibility(state, next, now);

  if (nextState === state) {
    return { entity: state, eventDrafts: [] };
  }

  const drafts: EventDraft<PublicationEvent>[] = [...stateDrafts];

  if (next === "private") {
    const cascadeDrafts = await revokeAllLinksInternal(
      nextState.noteId,
      now,
      repos.linkRepo,
    );
    for (const draft of cascadeDrafts) {
      drafts.push(draft);
    }
  }

  // Persist the state itself here so the cascade and the visibility
  // change land in the same UoW batch; the calling usecase still owns
  // the surrounding `unitOfWorkProvider.run`.
  const versioned = await repos.pubRepo.findById(nextState.noteId);
  if (versioned === null) {
    // First-time publication record. `changeVisibility` does not flip
    // the version off-zero except via `Version.next`, but we re-load
    // here to honour the OCC contract — if the caller passed a state
    // they constructed themselves (e.g. an in-memory upsert path)
    // we fall through to `insert`.
    await repos.pubRepo.insert(nextState);
  } else {
    await repos.pubRepo.save(nextState, versioned.expectedVersion);
  }

  return { entity: nextState, eventDrafts: drafts };
}

async function revokeAllLinksInternal(
  noteId: NoteId,
  now: Date,
  repo: ShareLinkRepository,
): Promise<readonly EventDraft<PublicationEvent>[]> {
  const links = await repo.findByNoteId(noteId);
  const drafts: EventDraft<PublicationEvent>[] = [];
  for (const link of links) {
    if (ShareLink.isRevoked(link)) continue;
    const versioned = await repo.findById(link.id);
    if (versioned === null) continue;
    const { entity: revoked, eventDrafts } = ShareLink.revoke(
      versioned.entity,
      now,
    );
    await repo.save(revoked, versioned.expectedVersion);
    for (const draft of eventDrafts) {
      drafts.push(draft);
    }
  }
  return drafts;
}

/**
 * Cascading revoke entry point exposed for callers that want to revoke
 * every link for a note without changing visibility (e.g. an owner
 * "rotate share links" admin action). Returns the resulting event
 * drafts so the caller can route them through `collectEvents`.
 */
async function revokeAllLinks(
  noteId: NoteId,
  now: Date,
  repo: ShareLinkRepository,
): Promise<readonly EventDraft<PublicationEvent>[]> {
  return revokeAllLinksInternal(noteId, now, repo);
}

/**
 * Per-note share-link quota check. Counts only active links so revoking
 * a link reclaims a slot.
 */
async function assertLinkQuota(
  noteId: NoteId,
  max: number,
  repo: ShareLinkRepository,
): Promise<void> {
  const active = await repo.countByNoteId(noteId, false);
  if (active >= max) {
    throw new BusinessRuleError(
      PublicationErrorCode.ShareLinkQuotaExceeded,
      `Share link quota exceeded for note ${noteId} (max ${max})`,
    );
  }
}

/**
 * Verify an incoming share-link password (or absence thereof) and
 * compute the updated link state.
 *
 * The link's `isOpen(now)` is checked first; a locked or revoked link
 * is rejected outright and is **not** mutated (no point in counting
 * additional failures past lockout).
 *
 * For a link without `passwordHash`, the visit is unconditionally
 * accepted and `recordAccess` runs.
 *
 * For a password-protected link:
 * - `password === null` is treated as a failed attempt
 * - a mismatch increments `failedAttempts` (and arms the lockout if
 *   the threshold is reached)
 * - a match resets the failure counter and records the access
 *
 * The caller persists `updatedLink` regardless of `ok` so the failure
 * counter / access timestamp survives.
 */
async function verifyShareLinkAccess(
  link: ShareLink,
  password: string | null,
  hasher: PasswordHasher,
  now: Date,
  policy: ShareLinkLockoutPolicy = DEFAULT_LOCKOUT_POLICY,
): Promise<ShareLinkVerifyResult> {
  if (!ShareLink.isOpen(link, now)) {
    return { ok: false, updatedLink: link, eventDrafts: [] };
  }
  // From here, `link.status === 'active'`.
  const active = link as Extract<ShareLink, { status: "active" }>;

  if (active.passwordHash === null) {
    return {
      ok: true,
      updatedLink: ShareLink.recordAccess(active, now),
      eventDrafts: [],
    };
  }

  if (password === null) {
    return {
      ok: false,
      updatedLink: ShareLink.recordFailedAttempt(
        active,
        now,
        policy.maxAttempts,
        policy.lockDurationSec,
      ),
      eventDrafts: [],
    };
  }

  const matched = await hasher.verify(password, active.passwordHash);
  if (!matched) {
    return {
      ok: false,
      updatedLink: ShareLink.recordFailedAttempt(
        active,
        now,
        policy.maxAttempts,
        policy.lockDurationSec,
      ),
      eventDrafts: [],
    };
  }
  const reset = ShareLink.resetFailedAttempts(active, now);
  return {
    ok: true,
    updatedLink: ShareLink.recordAccess(reset, now),
    eventDrafts: [],
  };
}

export const PublicationService = {
  DEFAULT_LINK_QUOTA,
  DEFAULT_LOCKOUT_POLICY,
  changeVisibilityAndCascade,
  revokeAllLinks,
  assertLinkQuota,
  verifyShareLinkAccess,
};
