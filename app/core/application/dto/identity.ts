import type { User } from "@/core/domain/identity/entity";
import type { Instant } from "./common";
import { toInstant } from "./common";

/**
 * Opaque session token. The DTO layer carries ids as plain `string`
 * (the domain's `unique symbol` brands and `XId.create()` value checks
 * stay inbound of the usecase boundary), so a session token needs no
 * dedicated alias — it is plain `string` like every other DTO id. The
 * SessionService adapter may return plain strings, JWTs, or other opaque
 * material verbatim. See `spec/usecases/index.md` for the rationale.
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
  };
}
