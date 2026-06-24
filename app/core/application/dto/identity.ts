import type { User } from "@/core/domain/identity/entity";
import type { SessionRecord } from "@/core/domain/identity/ports/sessionService";
import type { DeviceInfo } from "@/core/domain/identity/services/deviceInfo";
import { parseDeviceInfo } from "@/core/domain/identity/services/deviceInfo";
import type { Instant } from "./common";
import { toInstant, toInstantOrNull } from "./common";

/**
 * Opaque session token. Intentionally not branded: the SessionService
 * adapter may return plain strings, JWTs, or other opaque material verbatim.
 */
export type SessionToken = string;

export type UserDTO = Readonly<{
  id: string;
  username: string;
  email: string;
  displayName: string;
  bio: string | null;
  avatarMediaId: string | null;
  role: "member" | "admin";
  status: "pending" | "active" | "suspended" | "deleted";
  createdAt: Instant;
  /**
   * Last time the user record was persisted. Projected from `updatedAt`
   * (any mutation advances it) — there is no dedicated `lastSavedAt`
   * column. Surfaced for the P21 settings "最終保存" timestamp.
   */
  lastSavedAt: Instant;
  /**
   * When the username was last changed, or `null` if never.
   */
  lastUsernameChangedAt: Instant | null;
}>;

export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    bio: user.bio,
    avatarMediaId: user.avatarMediaId,
    role: user.role,
    status: user.status,
    createdAt: toInstant(user.createdAt),
    lastSavedAt: toInstant(user.updatedAt),
    lastUsernameChangedAt: toInstantOrNull(user.lastUsernameChangedAt),
  };
}

/**
 * Token-free projection of a session row for the P22 active-sessions list.
 * The port's `SessionRecord` carries the raw token; this DTO drops it so
 * the token never reaches the presentation layer. `isCurrent` is resolved
 * server-side here — the caller passes the request's session token (or `null`
 * when the cookie is absent) and we compare against `record.token`. The
 * client receives only the boolean.
 */
export type SessionDTO = Readonly<{
  id: string;
  isCurrent: boolean;
  userAgent: string | null;
  /**
   * Parsed OS / browser / device-kind summary of `userAgent`. Projected
   * here (application layer) so the presentation surface receives settled
   * values rather than re-parsing. Indeterminate fields are `null` — the
   * parser never fabricates a device name. The raw `userAgent` is retained
   * alongside this for fallback / transparency.
   */
  device: DeviceInfo;
  ipAddress: string | null;
  createdAt: Instant;
  /**
   * Last session-activity time. Advanced (throttled, best-effort) on each
   * `resolve` via `SessionService.recordActivity`, so this is now a
   * meaningful "最終アクセス" value the UI may surface. For a freshly issued
   * session that has not yet been activity-touched this equals `createdAt`
   * — that is the correct initial state, not a bug.
   */
  updatedAt: Instant;
  expiresAt: Instant;
}>;

/**
 * Read-only projection of the data that an account deletion affects,
 * surfaced by `summarizeAccountDeletion` for the P24 multi-step confirm
 * UI. Every field is a raw count / byte total — humanization (e.g.
 * bytes → GB) is the presentation layer's job.
 *
 * The values must stay faithful to the **actual** delete cascade
 * (`deleteAccount` + the `user.deleted` reaction handlers), because the
 * UI must not misrepresent what is destroyed. The cascade soft-deletes the
 * user, purges credentials, makes every note private (revoking all active
 * share links) and cancels in-progress export jobs. It does **not**
 * physically purge note bodies or media blobs — there is no `user.deleted`
 * reaction for notes/media — so the note/media counts describe data that
 * becomes inaccessible, not data that is immediately erased.
 */
export type AccountDeletionImpactDTO = Readonly<{
  /**
   * Owned active notes. After deletion they become inaccessible (login
   * is revoked and public access is stopped), but the rows are not
   * physically purged — do not present this as "immediately erased".
   */
  noteCount: number;
  /**
   * Count of `attached` media assets only (`pending` / `orphan` /
   * `deleting` are purge-lifecycle transients and excluded). Like
   * `noteCount`, these blobs are not immediately purged on deletion.
   */
  mediaCount: number;
  /**
   * Raw byte total of the `attached` media assets above. Formatting is
   * the presentation layer's responsibility.
   */
  mediaTotalBytes: number;
  /**
   * Active public notes. On deletion they are made private, so their
   * public URLs start returning 410 Gone. Counted via
   * `countPublicByOwner` (active-only INNER JOIN), which can diverge
   * slightly from the cascade (which privatizes every note, trashed
   * included) during the trash → outbox-relay lag window — hence the UI
   * softens this to an approximation rather than an exact SSOT.
   */
  publicNoteCount: number;
  /**
   * Active (non-revoked) share links across all owned notes — trashed
   * notes included — which the cascade revokes. Matches the cascade's
   * revocation set exactly.
   */
  activeShareLinkCount: number;
}>;

export function toSessionDTO(
  record: SessionRecord,
  currentSessionToken: string | null,
): SessionDTO {
  return {
    id: record.id,
    isCurrent:
      currentSessionToken !== null && record.token === currentSessionToken,
    userAgent: record.userAgent,
    device: parseDeviceInfo(record.userAgent),
    ipAddress: record.ipAddress,
    createdAt: toInstant(record.createdAt),
    updatedAt: toInstant(record.updatedAt),
    expiresAt: toInstant(record.expiresAt),
  };
}
