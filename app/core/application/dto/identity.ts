import type { User } from "@/core/domain/identity/entity";
import type { SessionRecord } from "@/core/domain/identity/ports/sessionService";
import type { Instant } from "./common";
import { toInstant, toInstantOrNull } from "./common";

/**
 * Opaque session token. Intentionally **not** branded — see
 * `spec/usecases/index.md` for the rationale: the SessionService adapter
 * may return plain strings, JWTs, or other opaque material verbatim, and
 * brand enforcement would force the adapter to generate brands too.
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
   * column. Surfaced for the P21 settings "最終保存" timestamp. See
   * `.issue/571/adr.md` ADR-001.
   */
  lastSavedAt: Instant;
  /**
   * When the username was last changed, or `null` if never. Drives the
   * P21 "次に変更できる日付" hint (cooldown = `USERNAME_CHANGE_COOLDOWN_MS`).
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
 * the token never reaches the presentation layer (see `.issue/572/adr.md`
 * ADR-002). `isCurrent` is resolved server-side here — the caller passes
 * the request's session token (or `null` when the cookie is absent) and we
 * compare against `record.token`. The client receives only the boolean.
 */
export type SessionDTO = Readonly<{
  id: string;
  isCurrent: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Instant;
  updatedAt: Instant;
  expiresAt: Instant;
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
    ipAddress: record.ipAddress,
    createdAt: toInstant(record.createdAt),
    updatedAt: toInstant(record.updatedAt),
    expiresAt: toInstant(record.expiresAt),
  };
}
