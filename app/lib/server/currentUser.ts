import "@tanstack/react-start/server-only";

import { redirect } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { cache } from "react";
import { getContainer } from "@/core/application/di/containerStore";
import { ForbiddenError } from "@/core/application/errors";
import type { User } from "@/core/domain/identity/entity";

/**
 * Authoritative session-cookie name. The `__Host-` prefix binds the
 * cookie to the exact origin + `Path=/`, matching the recommendation in
 * `@tanstack/react-start` auth primitives.
 */
const SESSION_COOKIE = "__Host-session";

function readSessionToken(headers: Headers): string | null {
  const raw = headers.get("cookie");
  if (raw === null) return null;
  for (const part of raw.split(/;\s*/)) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    if (part.slice(0, eq) === SESSION_COOKIE) {
      return decodeURIComponent(part.slice(eq + 1));
    }
  }
  return null;
}

/**
 * Read the caller's session token from the request cookie. Server
 * functions that need to thread `currentSessionToken` into a usecase
 * (change-password with `revokeOtherSessions`, revoke-all-others) use
 * this; pages that only need the user identity should call
 * {@link getCurrentUser} / {@link requireCurrentUser} instead.
 */
export function getCurrentSessionToken(): string | null {
  return readSessionToken(getRequestHeaders());
}

/**
 * Resolve the request's session cookie to the owning `User`, or return
 * `null` when no valid session is present. Uses `cache()` so multiple
 * server components within the same request share a single resolution.
 *
 * The helper goes through `getContainer()` directly because it is a
 * read + best-effort activity-touch (sessionService.resolve +
 * userRepository read, then a throttled `recordActivity`) that does not
 * need a usecase wrapper. The `server-only` import at the top blocks
 * accidental client-graph inclusion.
 *
 * `recordActivity` advances the session's "最終アクセス" time and is
 * fired after a successful `resolve` (#615 ADR-003). It is best-effort:
 * the write is idempotent and adapter-throttled (safe to run more than
 * once per request — the `cache()` at-most-once is an optimisation, not
 * a correctness premise), and any failure is swallowed with a logged
 * warning so an incidental D1 write error never fails authentication.
 * It runs *outside* the `unitOfWorkProvider.run` callback: sessions are
 * not part of the `findById` aggregate transaction.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = readSessionToken(getRequestHeaders());
  if (token === null) return null;
  const container = await getContainer();
  const resolved = await container.sessionService.resolve(token);
  if (resolved === null) return null;
  const found = await container.unitOfWorkProvider.run(({ userRepository }) =>
    userRepository.findById(resolved.userId),
  );
  if (found === null) return null;
  try {
    await container.sessionService.recordActivity(token);
  } catch (cause) {
    container.logger.warn("Failed to record session activity", { cause });
  }
  return found.entity;
});

export async function requireCurrentUser(): Promise<User> {
  const user = await getCurrentUser();
  if (user === null) {
    throw redirect({ to: "/login" });
  }
  return user;
}

/**
 * Require an active admin actor. Members, suspended / deleted users,
 * and unauthenticated visitors all surface as `ForbiddenError`
 * (HTTP 403) so the route's error boundary can render the same page.
 */
export async function requireAdminUser(): Promise<User> {
  const user = await getCurrentUser();
  if (user === null) {
    throw new ForbiddenError("FORBIDDEN_ADMIN_ONLY", "Admin access required");
  }
  if (user.status !== "active") {
    throw new ForbiddenError(
      "FORBIDDEN_ADMIN_ONLY",
      "Admin access requires an active account",
    );
  }
  if (user.role !== "admin") {
    throw new ForbiddenError("FORBIDDEN_ADMIN_ONLY", "Admin access required");
  }
  return user;
}
