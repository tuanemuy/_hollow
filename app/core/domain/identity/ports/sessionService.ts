import type { UserId } from "../valueObject";

export type SessionMeta = Readonly<{
  userAgent: string | null;
  ipAddress: string | null;
}>;

export type IssuedSession = Readonly<{
  token: string;
  expiresAt: Date;
}>;

export type ResolvedSession = Readonly<{
  userId: UserId;
  expiresAt: Date;
}>;

/**
 * Sign-in session plumbing. Sessions are not aggregates — the domain
 * does not model their lifecycle beyond "issued → resolvable → revoked".
 * Token format (opaque random / JWT / etc.) and storage (DB row /
 * stateless signature / external KV) are entirely up to the adapter.
 *
 * - `resolve` returns `null` for any non-resolvable token (expired,
 *   revoked, malformed, unknown). Callers cannot distinguish causes.
 * - `revoke` is idempotent: revoking an unknown / already-revoked token
 *   is a no-op, never an error.
 * - `revokeAllForUser` returns the number of sessions actually revoked
 *   so callers can surface "N other sessions signed out" UX.
 */
export interface SessionService {
  issue(userId: UserId, meta: SessionMeta): Promise<IssuedSession>;
  resolve(token: string): Promise<ResolvedSession | null>;
  revoke(token: string): Promise<void>;
  revokeAllForUser(userId: UserId, except?: string): Promise<number>;
}
