import type { User } from "@/core/domain/identity/entity";
import type { Instant } from "./common";
import { toInstant } from "./common";

/**
 * Branded string ids on the DTO side use a `__brand` symbol that is
 * distinct from the domain's `unique symbol` brand. The two are
 * structurally compatible (both are `string` underneath) so adapters
 * bridge with `as` casts at the projection boundary.
 */
export type UserId = string & { readonly __brand: "UserId" };
export type MediaAssetId = string & { readonly __brand: "MediaAssetId" };

/**
 * Opaque session token. Intentionally **not** branded — see
 * `spec/usecases/index.md` for the rationale: the SessionService adapter
 * may return plain strings, JWTs, or other opaque material verbatim, and
 * brand enforcement would force the adapter to generate brands too.
 */
export type SessionToken = string;

export type UserDTO = Readonly<{
  id: UserId;
  username: string;
  email: string;
  displayName: string;
  bio: string | null;
  avatarMediaId: MediaAssetId | null;
  role: "member" | "admin";
  status: "pending" | "active" | "suspended" | "deleted";
  createdAt: Instant;
}>;

export function toUserDTO(user: User): UserDTO {
  return {
    id: user.id as unknown as UserId,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    bio: user.bio,
    avatarMediaId:
      user.avatarMediaId === null
        ? null
        : (user.avatarMediaId as unknown as MediaAssetId),
    role: user.role,
    status: user.status,
    createdAt: toInstant(user.createdAt),
  };
}
