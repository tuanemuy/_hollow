import type { User } from "@/core/domain/identity/entity";
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
