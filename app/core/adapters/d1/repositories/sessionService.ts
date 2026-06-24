import { and, desc, eq, gt, lt, ne } from "drizzle-orm";
import type { Clock } from "@/core/application/ports/clock";
import type { IdGenerator } from "@/core/application/ports/idGenerator";
import type {
  IssuedSession,
  ResolvedSession,
  SessionMeta,
  SessionRecord,
  SessionService,
} from "@/core/domain/identity/ports/sessionService";
import { UserId } from "@/core/domain/identity/valueObject";
import type { Database } from "../client";
import { sessions, users } from "../schema";
import { mapDbError } from "./helpers";

/**
 * Session token TTL. better-auth's default is 30 days, matching the
 * spec note in `spec/database/index.md`. Adapter-local default so the
 * port surface stays symbol-free.
 */
const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Minimum gap between `recordActivity` writes for a given session. Writes
 * land at most once per window: a row updated more recently than this is
 * left untouched, so write-on-read does not hit D1 on every authenticated
 * request (#615 ADR-003). Kept ≤ the `formatRelativeTime` "たった今"
 * threshold so a just-active session never reads as "N minutes ago".
 */
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;

const TOKEN_BYTES = 32;

function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  // base64url so the token is URL / cookie safe without further
  // encoding. The padding-less form matches better-auth's session
  // cookie format.
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * D1 implementation of `SessionService` writing the better-auth
 * `sessions` table directly.
 *
 * Tokens are stored as plaintext per the better-auth schema convention
 * (see the `database/index.md` note on the design judgement — D1 is
 * treated as network-isolated and the 30-day TTL bounds blast radius).
 * Switching to a `token_hash` scheme later requires only this adapter.
 *
 * The service runs **outside** the UoW: sessions are not part of an
 * aggregate transaction, and the spec calls `revokeAllForUser` *after*
 * commit during `DeleteAccount`. All operations execute immediately
 * against the binding.
 */
export class D1SessionService implements SessionService {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly ttlMs: number = DEFAULT_SESSION_TTL_MS,
  ) {}

  async issue(userId: UserId, meta: SessionMeta): Promise<IssuedSession> {
    return mapDbError("Failed to issue session", async () => {
      const now = this.clock.now();
      const expiresAt = new Date(now.getTime() + this.ttlMs);
      const token = generateToken();
      await this.db.insert(sessions).values({
        id: this.idGenerator.next(),
        userId,
        token,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        impersonatedBy: null,
      });
      return { token, expiresAt };
    });
  }

  async resolve(token: string): Promise<ResolvedSession | null> {
    return mapDbError("Failed to resolve session", async () => {
      const now = this.clock.now();
      const rows = await this.db
        .select({
          userId: sessions.userId,
          expiresAt: sessions.expiresAt,
          deletedAt: users.deletedAt,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(
          and(
            eq(sessions.token, token),
            gt(sessions.expiresAt, now.toISOString()),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      // Soft-deleted user → session is no longer resolvable. Callers
      // cannot distinguish "expired" from "user deleted", which is the
      // single-null-path contract.
      if (row.deletedAt !== null) return null;
      return {
        userId: UserId.create(row.userId),
        expiresAt: new Date(row.expiresAt),
      };
    });
  }

  async revoke(token: string): Promise<void> {
    await mapDbError("Failed to revoke session", async () => {
      // Idempotent: deleting an unknown / already-revoked token is a
      // no-op. `delete` against a non-matching predicate completes
      // successfully and touches zero rows.
      await this.db.delete(sessions).where(eq(sessions.token, token));
    });
  }

  async revokeAllForUser(userId: UserId, except?: string): Promise<number> {
    return mapDbError("Failed to revoke user sessions", async () => {
      const predicate =
        except === undefined
          ? eq(sessions.userId, userId)
          : and(eq(sessions.userId, userId), ne(sessions.token, except));
      const rows = await this.db
        .delete(sessions)
        .where(predicate)
        .returning({ id: sessions.id });
      return rows.length;
    });
  }

  async listForUser(userId: UserId): Promise<readonly SessionRecord[]> {
    return mapDbError("Failed to list user sessions", async () => {
      const now = this.clock.now();
      // Same validity predicate as `resolve` (expired rows excluded). No
      // `users` join: the caller is listing their own sessions and is a
      // confirmed-alive actor. Newest-first via `created_at`.
      const rows = await this.db
        .select({
          id: sessions.id,
          token: sessions.token,
          userAgent: sessions.userAgent,
          ipAddress: sessions.ipAddress,
          createdAt: sessions.createdAt,
          updatedAt: sessions.updatedAt,
          expiresAt: sessions.expiresAt,
        })
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            gt(sessions.expiresAt, now.toISOString()),
          ),
        )
        .orderBy(desc(sessions.createdAt));
      return rows.map((row) => ({
        id: row.id,
        token: row.token,
        userAgent: row.userAgent,
        ipAddress: row.ipAddress,
        createdAt: new Date(row.createdAt),
        updatedAt: new Date(row.updatedAt),
        expiresAt: new Date(row.expiresAt),
      }));
    });
  }

  async recordActivity(token: string): Promise<void> {
    await mapDbError("Failed to record session activity", async () => {
      const now = this.clock.now();
      // `updated_at` is stored as an ISO 8601 string (see `issue`), so the
      // throttle compares strings — ISO 8601 is lexicographically ordered
      // by time — rather than relying on SQLite `datetime()` arithmetic,
      // which would not match the stored representation.
      const cutoff = new Date(
        now.getTime() - ACTIVITY_THROTTLE_MS,
      ).toISOString();
      // WHERE token + updated_at predicate ensures at most one row matches
      // (unique index on token guarantees high-cardinality, and cutoff
      // throttles the window). The row is 0–1, never >1.
      await this.db
        .update(sessions)
        .set({ updatedAt: now.toISOString() })
        .where(and(eq(sessions.token, token), lt(sessions.updatedAt, cutoff)));
    });
  }

  async revokeByIdForUser(userId: UserId, sessionId: string): Promise<void> {
    await mapDbError("Failed to revoke session", async () => {
      // Owner-scoped + idempotent: the `userId` predicate means another
      // user's id can never be revoked, and a non-matching predicate
      // simply touches zero rows.
      await this.db
        .delete(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
    });
  }
}
