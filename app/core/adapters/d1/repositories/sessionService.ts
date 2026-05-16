import { and, eq, gt, ne } from "drizzle-orm";
import type { Clock } from "@/core/application/ports/clock";
import type { IdGenerator } from "@/core/application/ports/idGenerator";
import type {
  IssuedSession,
  ResolvedSession,
  SessionMeta,
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
}
