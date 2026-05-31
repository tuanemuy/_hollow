import "@tanstack/react-start/server-only";

import { setCookie } from "@tanstack/react-start/server";
import { toUserDTO, type UserDTO } from "@/core/application/dto/identity";
import { getCurrentUser as readCurrentUserEntity } from "@/lib/server/currentUser";

/**
 * Authoritative session cookie name. Aligned with
 * `@/lib/server/currentUser` which reads the same cookie when resolving
 * the request user. The `__Host-` prefix binds the cookie to the exact
 * origin + `Path=/` per the `@tanstack/react-start` auth-primitive
 * recommendation.
 */
export const SESSION_COOKIE_NAME = "__Host-session";

/**
 * Cookie attributes used at issue / clear time. `__Host-` requires
 * `Secure` + `Path=/` + no `Domain`. Keep them aligned with the reader in
 * `@/lib/server/currentUser` (which only inspects the name; attributes are
 * the writer's concern).
 */
const BASE_COOKIE_OPTIONS = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/" as const,
  secure: true as const,
};

/**
 * Persist a freshly issued session token on the response. `expiresAt` is
 * the absolute expiry reported by the `SessionService` so the cookie
 * expires in sync with the server-side session row.
 */
export function setSessionCookie(token: string, expiresAt: Date): void {
  setCookie(SESSION_COOKIE_NAME, token, {
    ...BASE_COOKIE_OPTIONS,
    expires: expiresAt,
  });
}

/**
 * Drop the session cookie. `maxAge: 0` immediately expires the cookie on
 * the client without relying on `deleteCookie`'s implicit defaults.
 */
export function clearSessionCookie(): void {
  setCookie(SESSION_COOKIE_NAME, "", {
    ...BASE_COOKIE_OPTIONS,
    maxAge: 0,
  });
}

/**
 * Resolve the request-scoped user as a `UserDTO`. Wraps
 * `@/lib/server/currentUser` (which returns the domain `User` entity)
 * and projects it for routes / loaders that prefer the DTO surface.
 *
 * Filters out `deleted` / `suspended` users at this boundary so callers
 * treat them as "no user" without leaking the underlying status.
 */
export async function getCurrentUser(): Promise<UserDTO | null> {
  const user = await readCurrentUserEntity();
  if (user === null) return null;
  if (user.status === "deleted" || user.status === "suspended") return null;
  return toUserDTO(user);
}
