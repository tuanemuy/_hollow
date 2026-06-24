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
 * A single persisted session row, including its token. This stays in the
 * port layer (a domain-leaning read type) alongside `SessionMeta` /
 * `IssuedSession` / `ResolvedSession`; the application layer projects it
 * into a token-free `SessionDTO` for the presentation surface.
 */
export type SessionRecord = Readonly<{
  id: string;
  token: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
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
 * - `listForUser` returns the user's currently-valid sessions: expired
 *   rows (`expiresAt <= now`) are excluded. Revoked sessions are deleted
 *   rows, so they drop out naturally (this schema has no `revoked` flag
 *   column).
 * - `revokeByIdForUser` revokes a single session by its `id`, scoped to
 *   `userId`. Idempotent and owner-scoped: an id that is unknown or owned
 *   by another user is a no-op, never an error. Used for per-row sign-out
 *   where the client only ever holds opaque session ids, never tokens.
 * - `recordActivity` advances a resolved token's `updatedAt` to "now" so
 *   the P22 list can show a real "最終アクセス" time. Idempotent and
 *   best-effort: an unknown / expired token is a no-op, the adapter
 *   throttles the write (only updating when the row is older than a
 *   window), and the caller (`getCurrentUser`) is free to swallow failures
 *   — this is an incidental write that must not affect auth success.
 */
export interface SessionService {
  issue(userId: UserId, meta: SessionMeta): Promise<IssuedSession>;
  resolve(token: string): Promise<ResolvedSession | null>;
  revoke(token: string): Promise<void>;
  revokeAllForUser(userId: UserId, except?: string): Promise<number>;
  listForUser(userId: UserId): Promise<readonly SessionRecord[]>;
  revokeByIdForUser(userId: UserId, sessionId: string): Promise<void>;
  recordActivity(token: string): Promise<void>;
}
