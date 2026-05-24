import { eq, lte, sql } from "drizzle-orm";
import type { Clock } from "@/core/application/ports/clock";
import type { IdGenerator } from "@/core/application/ports/idGenerator";
import type {
  ChallengeError,
  ConsumedChallenge,
  DurationMs,
  IssuedChallenge,
  VerificationChallenge,
} from "@/core/domain/identity/ports/verificationChallenge";
import {
  type ChallengePurpose,
  UserId,
} from "@/core/domain/identity/valueObject";
import type { Database } from "../client";
import type { PendingBatch } from "../pendingBatch";
import { verifications } from "../schema";
import { mapDbError } from "./helpers";

const TOKEN_BYTES = 32;

function generateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function buildIdentifier(purpose: ChallengePurpose, userId: UserId): string {
  return `${purpose}:${userId}`;
}

type StoredValue = {
  readonly token: string;
  readonly payload: Readonly<Record<string, string>>;
};

function encodeValue(token: string, payload: Record<string, string>): string {
  // The DB column is a single text field; we encode the token plus the
  // optional payload as JSON so consumption can split them. Lookup by
  // value still uses the JSON string directly (the UNIQUE index on
  // `value` is preserved).
  return JSON.stringify({ token, payload });
}

function decodeValue(raw: string): StoredValue | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      typeof parsed.token !== "string"
    ) {
      return null;
    }
    const payload =
      parsed.payload && typeof parsed.payload === "object"
        ? (parsed.payload as Record<string, string>)
        : {};
    return { token: parsed.token, payload };
  } catch {
    return null;
  }
}

/**
 * D1 implementation of `VerificationChallenge` over the better-auth
 * `verifications` table.
 *
 * Writes (`issue` and `consume`) participate in the surrounding unit of
 * work — the spec calls out token issuance / consumption as
 * UoW-participating so a token row can be rolled back atomically with
 * the User mutation that motivated it. Reads inside `consume`
 * (the value lookup) execute immediately against the binding because
 * D1 has no interactive transactions; the actual row delete is
 * registered onto the `PendingBatch`.
 *
 * Token storage. Values are stored as `JSON.stringify({ token, payload
 * })` so the schema's single `value` column can carry both the secret
 * and the purpose-specific metadata (e.g. `newEmail` for `email_change`).
 * The token is plaintext per the spec's design judgement (D1 is treated
 * as network-isolated; richer requirements switch to a hash scheme).
 *
 * `issue` invalidates prior un-consumed tokens for the same
 * `(userId, purpose)` by hard-deleting them in the same batch as the
 * new insert — the simpler of the two adapter strategies the port
 * permits.
 */
export class D1VerificationChallenge implements VerificationChallenge {
  constructor(
    private readonly db: Database,
    private readonly pending: PendingBatch,
    private readonly idGenerator: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async issue(
    userId: UserId,
    purpose: ChallengePurpose,
    ttl: DurationMs,
    payload?: Readonly<Record<string, string>>,
  ): Promise<IssuedChallenge> {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + ttl);
    const plainToken = generateToken();
    const identifier = buildIdentifier(purpose, userId);
    const value = encodeValue(plainToken, payload ? { ...payload } : {});

    // Invalidate prior un-consumed tokens for the same (userId, purpose)
    // pair. We hard-delete; this matches one of the two strategies the
    // port permits (see `ChallengeError` JSDoc — callers must already
    // accept `not_found` or `consumed`).
    this.pending.add(
      this.db
        .delete(verifications)
        .where(eq(verifications.identifier, identifier)),
    );

    this.pending.add(
      this.db.insert(verifications).values({
        id: this.idGenerator.next(),
        identifier,
        value,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }),
    );

    return { plainToken };
  }

  async consume(
    token: string,
    expectedPurpose: ChallengePurpose,
  ): Promise<ConsumedChallenge | ChallengeError> {
    // Lookup by exact match on the embedded `token` field. SQLite's
    // `LIKE` was previously used to scope the candidate set, but its
    // `_` metacharacter cannot be escaped without an `ESCAPE` clause,
    // and base64url tokens contain `_` ~75% of the time — every such
    // token silently missed. `json_extract` matches the exact field
    // value with no metacharacter hazard; the table stays small enough
    // that a linear scan is fine.
    const rows = await mapDbError(
      "Failed to look up verification challenge",
      async () => {
        return await this.db
          .select()
          .from(verifications)
          .where(
            sql`json_extract(${verifications.value}, '$.token') = ${token}`,
          )
          .limit(2);
      },
    );

    const matched = rows[0] ?? null;
    if (!matched) return "not_found";

    const decoded = decodeValue(matched.value);
    if (!decoded || decoded.token !== token) return "not_found";

    const now = this.clock.now();
    const expiresAt = new Date(matched.expiresAt);
    if (now >= expiresAt) {
      // Schedule the expired row for cleanup so the same token cannot
      // be reused even briefly between expiry and the pruner sweep.
      this.pending.add(
        this.db.delete(verifications).where(eq(verifications.id, matched.id)),
      );
      return "expired";
    }

    const [storedPurpose, storedUserIdRaw] = matched.identifier.split(
      ":",
      2,
    ) as [string | undefined, string | undefined];
    if (!storedPurpose || !storedUserIdRaw) return "not_found";
    if (storedPurpose !== expectedPurpose) {
      return "purpose_mismatch";
    }

    let userId: UserId;
    try {
      userId = UserId.create(storedUserIdRaw);
    } catch {
      return "not_found";
    }

    // Hard-delete the row to enforce single-use. Equivalent to the
    // "consumed" terminal state per the port contract; subsequent
    // consumes return `not_found`.
    this.pending.add(
      this.db.delete(verifications).where(eq(verifications.id, matched.id)),
    );

    return { userId, payload: decoded.payload };
  }

  /**
   * Maintenance helper for the pruner worker. Not part of the port
   * contract but exposed so the pruner can purge expired rows in the
   * same sweep as outbox pruning. Not invoked by any usecase.
   */
  async pruneExpired(now: Date): Promise<{ deleted: number }> {
    return mapDbError("Failed to prune expired challenges", async () => {
      const rows = await this.db
        .delete(verifications)
        .where(lte(verifications.expiresAt, now.toISOString()))
        .returning({ id: verifications.id });
      return { deleted: rows.length };
    });
  }
}
