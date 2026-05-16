import { and, eq } from "drizzle-orm";
import { SystemError, SystemErrorCode } from "@/core/application/errors";
import type { Clock } from "@/core/application/ports/clock";
import type { IdGenerator } from "@/core/application/ports/idGenerator";
import { BusinessRuleError } from "@/core/domain/error";
import { IdentityErrorCode } from "@/core/domain/identity/errorCode";
import type { CredentialStore } from "@/core/domain/identity/ports/credentialStore";
import {
  type CredentialSummary,
  type EmailAddress,
  type RawPassword,
  UserId,
} from "@/core/domain/identity/valueObject";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { accounts, users } from "../schema";
import { mapDbError } from "./helpers";

const CREDENTIAL_PROVIDER_ID = "credential";

// PBKDF2-SHA256 parameters. Workers expose Web Crypto natively, and
// PBKDF2 is the only password-style KDF available there without a
// third-party WASM build. The iteration count is OWASP 2023 guidance
// for PBKDF2-HMAC-SHA256.
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_KEY_BYTES = 32;
const PBKDF2_HASH = "SHA-256";
const PBKDF2_ENCODING_VERSION = "pbkdf2-sha256-v1";

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hashPassword(raw: string): Promise<string> {
  const salt = new Uint8Array(PBKDF2_SALT_BYTES);
  crypto.getRandomValues(salt);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(raw),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    PBKDF2_KEY_BYTES * 8,
  );
  // Encoded form: `<version>$<iter>$<salt-b64>$<hash-b64>`. Keeps
  // verification parameter-aware so iteration counts can be tuned
  // without invalidating stored hashes.
  return [
    PBKDF2_ENCODING_VERSION,
    String(PBKDF2_ITERATIONS),
    bytesToBase64(salt),
    bytesToBase64(new Uint8Array(derived)),
  ].join("$");
}

// Constant-time byte comparison. Required so verification timing does
// not leak information about which prefix of the hash matched.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return diff === 0;
}

async function verifyHash(raw: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 4) return false;
  const [version, iterStr, saltB64, hashB64] = parts as [
    string,
    string,
    string,
    string,
  ];
  if (version !== PBKDF2_ENCODING_VERSION) return false;
  const iterations = Number.parseInt(iterStr, 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  let salt: Uint8Array<ArrayBuffer>;
  let expected: Uint8Array<ArrayBuffer>;
  try {
    salt = base64ToBytes(saltB64);
    expected = base64ToBytes(hashB64);
  } catch {
    return false;
  }
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(raw),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: PBKDF2_HASH },
    keyMaterial,
    expected.length * 8,
  );
  return timingSafeEqual(new Uint8Array(derived), expected);
}

/**
 * D1 implementation of `CredentialStore` that writes directly to the
 * better-auth `accounts` table.
 *
 * Two execution modes share the surface:
 *
 * - **Mutations inside a UoW.** `registerPassword`, `changePassword`,
 *   `resetPassword`, `removePassword`, `linkProvider`, `unlinkProvider`,
 *   and `purgeAll` mutate `accounts` rows and must commit atomically
 *   with the `User` aggregate change that motivated them
 *   (`DeleteAccount` is the canonical example). Each enqueues onto the
 *   supplied `PendingBatch` so the surrounding `D1UnitOfWorkProvider`
 *   flushes them in one `db.batch()` call.
 *
 * - **Reads outside a UoW.** `verifyPassword`, `verifyPasswordForUser`,
 *   `hasPassword`, `resolveProvider`, and `listCredentials` execute
 *   immediately against the binding. They participate in no
 *   transaction.
 *
 * better-auth integration scope. better-auth is not wired in this wave;
 * the adapter therefore writes the `accounts` table directly per the
 * task brief. Password hashing uses Web Crypto PBKDF2-SHA256 (Workers
 * compatible, no WASM dependency). Swapping to better-auth's own
 * password handler later is a single-class change.
 *
 * OAuth (`linkProvider` / `unlinkProvider` / `resolveProvider`) is
 * implemented — `accounts` rows differentiate provider by `provider_id`.
 * No external OAuth flow is wired (that would require a runtime IdP
 * roundtrip); the adapter only persists the link a higher layer has
 * already negotiated. `accountId` is the IdP `sub` per the schema spec.
 */
export class D1CredentialStore implements CredentialStore {
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async registerPassword(userId: UserId, raw: RawPassword): Promise<void> {
    const existing = await mapDbError(
      "Failed to check existing password credential",
      async () => {
        const rows = await this.db
          .select({ id: accounts.id })
          .from(accounts)
          .where(
            and(
              eq(accounts.userId, userId),
              eq(accounts.providerId, CREDENTIAL_PROVIDER_ID),
            ),
          )
          .limit(1);
        return rows[0];
      },
    );
    if (existing) {
      throw new BusinessRuleError(
        IdentityErrorCode.PasswordAlreadySet,
        `User ${userId} already has a password credential`,
      );
    }
    const hash = await hashPassword(raw);
    const now = this.clock.now().toISOString();
    this.pending.add(
      this.db.insert(accounts).values({
        id: this.idGenerator.next(),
        userId,
        accountId: userId,
        providerId: CREDENTIAL_PROVIDER_ID,
        password: hash,
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scope: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  async verifyPassword(
    email: EmailAddress,
    raw: string,
  ): Promise<UserId | null> {
    // Single-purpose negative path: any lookup / hash mismatch /
    // soft-deleted state collapses to `null` so callers cannot
    // distinguish "no such email" from "wrong password".
    try {
      const rows = await this.db
        .select({
          userId: users.id,
          deletedAt: users.deletedAt,
          password: accounts.password,
        })
        .from(users)
        .leftJoin(
          accounts,
          and(
            eq(accounts.userId, users.id),
            eq(accounts.providerId, CREDENTIAL_PROVIDER_ID),
          ),
        )
        .where(eq(users.email, email))
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      if (row.deletedAt !== null) return null;
      if (row.password === null) return null;
      const ok = await verifyHash(raw, row.password);
      if (!ok) return null;
      return UserId.create(row.userId);
    } catch (error) {
      // Adapter-internal exceptions are still mapped — but `verifyPassword`'s
      // contract forbids throwing on auth failure. Re-raise only true
      // system errors; mask any value-object construction failure as `null`.
      if (error instanceof BusinessRuleError) return null;
      throw new SystemError(
        SystemErrorCode.DatabaseError,
        "Failed to verify password",
        error,
      );
    }
  }

  async verifyPasswordForUser(userId: UserId, raw: string): Promise<boolean> {
    try {
      const rows = await this.db
        .select({
          deletedAt: users.deletedAt,
          password: accounts.password,
        })
        .from(users)
        .leftJoin(
          accounts,
          and(
            eq(accounts.userId, users.id),
            eq(accounts.providerId, CREDENTIAL_PROVIDER_ID),
          ),
        )
        .where(eq(users.id, userId))
        .limit(1);
      const row = rows[0];
      if (!row) return false;
      if (row.deletedAt !== null) return false;
      if (row.password === null) return false;
      return await verifyHash(raw, row.password);
    } catch (error) {
      throw new SystemError(
        SystemErrorCode.DatabaseError,
        "Failed to verify password for user",
        error,
      );
    }
  }

  async changePassword(
    userId: UserId,
    currentRaw: string,
    newRaw: RawPassword,
  ): Promise<void> {
    const ok = await this.verifyPasswordForUser(userId, currentRaw);
    if (!ok) {
      // Per the port contract, the application layer raises
      // `AuthenticationError('invalid_credentials')` for this case. The
      // adapter signals it with a `BusinessRuleError` carrying a
      // distinctive code so the usecase can translate; this is a
      // deliberate channel since the application layer's
      // `UnauthorizedError` is not visible inward.
      throw new BusinessRuleError(
        "invalid_credentials",
        "Current password does not match",
      );
    }
    const hash = await hashPassword(newRaw);
    const now = this.clock.now().toISOString();
    this.pending.add(
      this.db
        .update(accounts)
        .set({ password: hash, updatedAt: now })
        .where(
          and(
            eq(accounts.userId, userId),
            eq(accounts.providerId, CREDENTIAL_PROVIDER_ID),
          ),
        ),
    );
  }

  async resetPassword(userId: UserId, newRaw: RawPassword): Promise<void> {
    const hash = await hashPassword(newRaw);
    const now = this.clock.now().toISOString();
    // Force-reset path. Skips current-password verification because the
    // caller has authenticated the user out-of-band (e.g. via
    // VerificationChallenge.consume on a password_reset token).
    this.pending.add(
      this.db
        .update(accounts)
        .set({ password: hash, updatedAt: now })
        .where(
          and(
            eq(accounts.userId, userId),
            eq(accounts.providerId, CREDENTIAL_PROVIDER_ID),
          ),
        ),
    );
  }

  async removePassword(userId: UserId): Promise<void> {
    this.pending.add(
      this.db
        .delete(accounts)
        .where(
          and(
            eq(accounts.userId, userId),
            eq(accounts.providerId, CREDENTIAL_PROVIDER_ID),
          ),
        ),
    );
  }

  async hasPassword(userId: UserId): Promise<boolean> {
    return mapDbError("Failed to check password presence", async () => {
      const rows = await this.db
        .select({ id: accounts.id })
        .from(accounts)
        .where(
          and(
            eq(accounts.userId, userId),
            eq(accounts.providerId, CREDENTIAL_PROVIDER_ID),
          ),
        )
        .limit(1);
      return rows.length > 0;
    });
  }

  async linkProvider(
    userId: UserId,
    providerId: string,
    providerAccountId: string,
  ): Promise<void> {
    if (providerId === CREDENTIAL_PROVIDER_ID) {
      throw new BusinessRuleError(
        IdentityErrorCode.InvalidCredentialKind,
        `Provider id "${providerId}" is reserved for password credentials`,
      );
    }
    const existing = await mapDbError(
      "Failed to check existing provider link",
      async () => {
        const rows = await this.db
          .select({ id: accounts.id, userId: accounts.userId })
          .from(accounts)
          .where(
            and(
              eq(accounts.providerId, providerId),
              eq(accounts.accountId, providerAccountId),
            ),
          )
          .limit(1);
        return rows[0];
      },
    );
    if (existing) {
      throw new BusinessRuleError(
        IdentityErrorCode.ProviderAlreadyLinked,
        `Provider ${providerId}:${providerAccountId} is already linked`,
      );
    }
    const now = this.clock.now().toISOString();
    this.pending.add(
      this.db.insert(accounts).values({
        id: this.idGenerator.next(),
        userId,
        accountId: providerAccountId,
        providerId,
        password: null,
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scope: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  async unlinkProvider(userId: UserId, providerId: string): Promise<void> {
    if (providerId === CREDENTIAL_PROVIDER_ID) {
      throw new BusinessRuleError(
        IdentityErrorCode.InvalidCredentialKind,
        `Provider id "${providerId}" is reserved for password credentials`,
      );
    }
    this.pending.add(
      this.db
        .delete(accounts)
        .where(
          and(eq(accounts.userId, userId), eq(accounts.providerId, providerId)),
        ),
    );
  }

  async resolveProvider(
    providerId: string,
    providerAccountId: string,
  ): Promise<UserId | null> {
    return mapDbError("Failed to resolve provider", async () => {
      const rows = await this.db
        .select({ userId: accounts.userId })
        .from(accounts)
        .where(
          and(
            eq(accounts.providerId, providerId),
            eq(accounts.accountId, providerAccountId),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row ? UserId.create(row.userId) : null;
    });
  }

  async listCredentials(userId: UserId): Promise<readonly CredentialSummary[]> {
    return mapDbError("Failed to list credentials", async () => {
      const rows = await this.db
        .select({
          providerId: accounts.providerId,
          accountId: accounts.accountId,
          createdAt: accounts.createdAt,
        })
        .from(accounts)
        .where(eq(accounts.userId, userId));
      return rows.map((row): CredentialSummary => {
        const createdAt = new Date(row.createdAt);
        if (row.providerId === CREDENTIAL_PROVIDER_ID) {
          return { kind: "password", createdAt };
        }
        return {
          kind: "oauth",
          providerId: row.providerId,
          providerAccountId: row.accountId,
          createdAt,
        };
      });
    });
  }

  async purgeAll(userId: UserId): Promise<void> {
    // Idempotent physical purge of every credential row. The DeleteAccount
    // usecase invokes this inside the same UoW as `User.markDeleted`, so
    // the credential row deletions commit atomically with the soft-delete
    // marker on `users`. Per the spec, this bypasses better-auth APIs and
    // writes the table directly.
    this.pending.add(
      this.db.delete(accounts).where(eq(accounts.userId, userId)),
    );
  }
}
