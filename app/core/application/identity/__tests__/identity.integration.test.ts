import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { EnvSetupTokenVerifier } from "@/core/adapters/cloudflare/identity/setupTokenVerifier";
import * as schema from "@/core/adapters/d1/schema";
import {
  isAuthenticationError,
  isForbiddenError,
} from "@/core/application/errors";
import { isBusinessRuleError } from "@/core/domain/error";
import {
  setupTestContainer,
  type TestContainer,
} from "../../__tests__/helpers";
import { adminSignUp } from "../adminSignUp";
import { changePassword } from "../changePassword";
import { changeUsername } from "../changeUsername";
import { deleteAccount } from "../deleteAccount";
import { demoteAdmin } from "../demoteAdmin";
import { logIn } from "../logIn";
import { logOut } from "../logOut";
import { promoteUserToAdmin } from "../promoteUserToAdmin";
import { reinstateUser } from "../reinstateUser";
import { requestEmailChange } from "../requestEmailChange";
import { requestPasswordReset } from "../requestPasswordReset";
import { resendVerification } from "../resendVerification";
import { resetPassword } from "../resetPassword";
import { revokeAllOtherSessions } from "../revokeAllOtherSessions";
import { type SignUpInput, signUp } from "../signUp";
import { suspendUser } from "../suspendUser";
import { updateProfile } from "../updateProfile";
import { verifyEmail } from "../verifyEmail";
import { verifyEmailChange } from "../verifyEmailChange";

/**
 * Integration tests covering the representative paths from
 * `spec/testcases/identity/index.md`.
 *
 * The integration setup (`app/core/adapters/d1/__tests__/setup.ts`) only
 * truncates todos / outbox / processed_events globally; this file
 * additionally clears identity-related tables in `beforeEach` so tests
 * start from a deterministic state regardless of which other identity
 * tests ran in the same isolate.
 */

async function truncateIdentityTables(container: TestContainer): Promise<void> {
  // FK order: child tables before parents. `users` is the root and is
  // referenced by many cascades (sessions, accounts, verifications,
  // directories, notes, media_assets, etc.). We delete the obviously-
  // relevant children explicitly and let SQLite handle the rest via
  // CASCADE on the final `users` delete.
  await container.db.delete(schema.sessions);
  await container.db.delete(schema.accounts);
  await container.db.delete(schema.verifications);
  await container.db.delete(schema.publicationStates);
  await container.db.delete(schema.exportJobs);
  await container.db.delete(schema.mediaAssets);
  await container.db.delete(schema.notes);
  await container.db.delete(schema.directories);
  await container.db.delete(schema.users);
  await container.db.delete(schema.instanceSettings);
}

function strongPassword(seed = ""): string {
  // 12 chars, letters + digits — passes RawPassword variety check.
  return `Passw0rd!${seed}`.padEnd(12, "0");
}

function uniqueEmail(seed: string): string {
  return `${seed}@example.com`;
}

const baseSignUp = (seed: string): SignUpInput => ({
  username: `u${seed}`,
  email: uniqueEmail(seed),
  password: strongPassword(seed),
  displayName: null,
  acceptTerms: true,
});

type UserStatusFlags = {
  emailVerified: number;
  banned: number;
  deletedAt: string | null;
};

function deriveStatus(
  row: UserStatusFlags,
): "pending" | "active" | "suspended" | "deleted" {
  if (row.deletedAt !== null) return "deleted";
  if (row.banned === 1) return "suspended";
  if (row.emailVerified === 0) return "pending";
  return "active";
}

async function readVerificationToken(
  container: TestContainer,
  userId: string,
  purpose: "email_verification" | "password_reset" | "email_change",
): Promise<string> {
  const rows = await container.db
    .select()
    .from(schema.verifications)
    .where(eq(schema.verifications.identifier, `${purpose}:${userId}`));
  if (rows.length !== 1) {
    throw new Error(
      `expected exactly one ${purpose} token for ${userId}, found ${rows.length}`,
    );
  }
  const row = rows[0];
  if (!row) throw new Error("unreachable");
  const decoded = JSON.parse(row.value) as {
    token: string;
    payload?: Record<string, string>;
  };
  return decoded.token;
}

describe("SignUp", () => {
  const getContainer = setupTestContainer();
  beforeEach(async () => {
    await truncateIdentityTables(getContainer());
  });

  it("creates a pending member with a password credential and a root directory", async () => {
    const container = getContainer();
    const { userId } = await signUp({
      container,
      input: baseSignUp("alice01"),
    });

    const userRow = await container.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(userRow).toHaveLength(1);
    const u0 = userRow[0];
    if (!u0) return;
    expect(deriveStatus(u0)).toBe("pending");
    expect(u0.role).toBe("member");

    const accountRow = await container.db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, userId));
    expect(accountRow).toHaveLength(1);
    expect(accountRow[0]?.providerId).toBe("credential");

    const dirRows = await container.db
      .select()
      .from(schema.directories)
      .where(eq(schema.directories.ownerId, userId));
    expect(dirRows.length).toBeGreaterThanOrEqual(1);

    const verifications = await container.db
      .select()
      .from(schema.verifications)
      .where(
        eq(schema.verifications.identifier, `email_verification:${userId}`),
      );
    expect(verifications).toHaveLength(1);
  });

  it("rejects sign-up when registration is closed", async () => {
    const container = getContainer();
    // Seed instance_settings with registration_open=0. Shape mirrors
    // the adapter's `save()` projection so `get()` rehydrates cleanly.
    await container.db.insert(schema.instanceSettings).values({
      id: "singleton",
      llmProvider: "anthropic",
      llmModel: "claude-3-5-sonnet",
      llmApiKeySource: "env",
      llmApiKeyCiphertext: null,
      promptsJson: "{}",
      designTokensJson: JSON.stringify({ tokens: {} }),
      registrationOpen: 0,
      registrationClosedReason: "Closed for maintenance",
      limitsJson: JSON.stringify({
        maxUploadBytesPerDay: 1_000_000,
        maxIngestionBytes: 1_000_000,
        maxNoteBytes: 1_000_000,
        maxExportArtifactBytes: 1_000_000,
        maxShareLinksPerNote: 5,
        editLockTtlSec: 60,
        trashRetentionDays: 30,
      }),
      version: 1,
      updatedAt: new Date().toISOString(),
    });

    try {
      await signUp({ container, input: baseSignUp("bob1") });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("registration_closed");
      }
    }
  });

  it("rejects duplicate username", async () => {
    const container = getContainer();
    await signUp({ container, input: baseSignUp("charlie") });
    try {
      await signUp({
        container,
        input: {
          ...baseSignUp("charlie"),
          email: "charlie2@example.com",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("username_taken");
      }
    }
  });

  it("rejects duplicate email", async () => {
    const container = getContainer();
    await signUp({ container, input: baseSignUp("dave1") });
    try {
      await signUp({
        container,
        input: { ...baseSignUp("dave1"), username: "dave2" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("email_taken");
      }
    }
  });

  it("creates role=member even when DB is empty (no first-user admin)", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("first1") });
    const userRow = await container.db
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(userRow[0]?.role).toBe("member");
  });
});

describe("AdminSignUp", () => {
  const getContainer = setupTestContainer();
  beforeEach(async () => {
    await truncateIdentityTables(getContainer());
  });

  it("requires the setup token to be enabled", async () => {
    const container = getContainer();
    try {
      await adminSignUp({
        container,
        input: { ...baseSignUp("admin1"), setupToken: "anything" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isAuthenticationError(error)).toBe(true);
      if (isAuthenticationError(error)) {
        expect(error.code).toBe("setup_token_disabled");
      }
    }
  });

  it("rejects an incorrect token", async () => {
    const container: TestContainer = {
      ...getContainer(),
      setupTokenVerifier: new EnvSetupTokenVerifier({
        ADMIN_SETUP_TOKEN: "secret-token",
      }),
    };
    try {
      await adminSignUp({
        container,
        input: { ...baseSignUp("admin2"), setupToken: "wrong-token" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isAuthenticationError(error)).toBe(true);
      if (isAuthenticationError(error)) {
        expect(error.code).toBe("invalid_setup_token");
      }
    }
  });

  it("creates an admin user when token matches", async () => {
    const container: TestContainer = {
      ...getContainer(),
      setupTokenVerifier: new EnvSetupTokenVerifier({
        ADMIN_SETUP_TOKEN: "secret-token",
      }),
    };
    const { userId } = await adminSignUp({
      container,
      input: { ...baseSignUp("admin3"), setupToken: "secret-token" },
    });
    const row = await container.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    const u = row[0];
    if (!u) return;
    expect(u.role).toBe("admin");
    expect(deriveStatus(u)).toBe("pending");
  });
});

describe("VerifyEmail", () => {
  const getContainer = setupTestContainer();
  beforeEach(async () => {
    await truncateIdentityTables(getContainer());
  });

  it("activates the user and issues a session", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("eve1") });
    const token = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );

    const result = await verifyEmail({ container, input: { token } });
    expect(result.userId).toBe(userId);
    expect(typeof result.sessionToken).toBe("string");

    const row = await container.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    const u = row[0];
    if (!u) return;
    expect(deriveStatus(u)).toBe("active");
  });

  it("rejects an unknown token with token_not_found", async () => {
    const container = getContainer();
    try {
      await verifyEmail({ container, input: { token: "does-not-exist" } });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("token_not_found");
      }
    }
  });

  it("rejects a consumed token on the second attempt", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("fred01") });
    const token = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token } });
    try {
      await verifyEmail({ container, input: { token } });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        // Adapter hard-deletes on consume → `not_found`; either code is
        // acceptable per the port contract (see ChallengeError JSDoc).
        expect(["token_not_found", "token_consumed"]).toContain(error.code);
      }
    }
  });

  it("rejects a password_reset token used at verify-email", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("greta1") });
    // Verify first, so the user is active.
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token: verifyToken } });

    // Request a password-reset and pull its token.
    await requestPasswordReset({
      container,
      input: { email: uniqueEmail("greta1") },
    });
    const resetToken = await readVerificationToken(
      container,
      userId,
      "password_reset",
    );

    try {
      await verifyEmail({ container, input: { token: resetToken } });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("token_purpose_mismatch");
      }
    }
  });
});

describe("ResendVerification", () => {
  const getContainer = setupTestContainer();
  beforeEach(async () => {
    await truncateIdentityTables(getContainer());
  });

  it("re-issues a token (invalidating the prior one) for a pending user", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("hank01") });
    const firstToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );

    await resendVerification({
      container,
      input: { email: uniqueEmail("hank01") },
    });
    const secondToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    expect(secondToken).not.toBe(firstToken);
  });

  it("is a no-op for unknown email (no enumeration signal)", async () => {
    const container = getContainer();
    await expect(
      resendVerification({
        container,
        input: { email: "nobody@example.com" },
      }),
    ).resolves.toBeUndefined();
  });

  it("is a no-op for an active user", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("ivy12") });
    const token = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token } });

    await resendVerification({
      container,
      input: { email: uniqueEmail("ivy12") },
    });
    // No new token should be issued for an active user.
    const rows = await container.db
      .select()
      .from(schema.verifications)
      .where(
        eq(schema.verifications.identifier, `email_verification:${userId}`),
      );
    expect(rows).toHaveLength(0);
  });
});

describe("LogIn / LogOut", () => {
  const getContainer = setupTestContainer();
  beforeEach(async () => {
    await truncateIdentityTables(getContainer());
  });

  it("returns a session token for an active user with the correct password", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("jack01") });
    const token = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token } });

    const result = await logIn({
      container,
      input: {
        email: uniqueEmail("jack01"),
        password: strongPassword("jack01"),
        userAgent: null,
        ipAddress: null,
      },
    });
    expect(result.userId).toBe(userId);
    expect(typeof result.sessionToken).toBe("string");
  });

  it("rejects an unknown email with invalid_credentials", async () => {
    const container = getContainer();
    try {
      await logIn({
        container,
        input: {
          email: "nobody@example.com",
          password: strongPassword(),
          userAgent: null,
          ipAddress: null,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isAuthenticationError(error)).toBe(true);
      if (isAuthenticationError(error)) {
        expect(error.code).toBe("invalid_credentials");
      }
    }
  });

  it("rejects login for a pending user with unverified", async () => {
    const container = getContainer();
    await signUp({ container, input: baseSignUp("kate01") });
    try {
      await logIn({
        container,
        input: {
          email: uniqueEmail("kate01"),
          password: strongPassword("kate01"),
          userAgent: null,
          ipAddress: null,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isAuthenticationError(error)).toBe(true);
      if (isAuthenticationError(error)) {
        expect(error.code).toBe("unverified");
      }
    }
  });

  it("rejects login with wrong password", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("liam01") });
    const token = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token } });

    try {
      await logIn({
        container,
        input: {
          email: uniqueEmail("liam01"),
          password: "WrongPass99!a",
          userAgent: null,
          ipAddress: null,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isAuthenticationError(error)).toBe(true);
      if (isAuthenticationError(error)) {
        expect(error.code).toBe("invalid_credentials");
      }
    }
  });

  it("logOut is idempotent for unknown tokens", async () => {
    const container = getContainer();
    await expect(
      logOut({ container, input: { sessionToken: "unknown-token" } }),
    ).resolves.toBeUndefined();
  });

  it("logOut revokes a real session", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("mia012") });
    const token = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    const verified = await verifyEmail({ container, input: { token } });

    const before = await container.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.token, verified.sessionToken));
    expect(before).toHaveLength(1);

    await logOut({
      container,
      input: { sessionToken: verified.sessionToken },
    });
    const after = await container.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.token, verified.sessionToken));
    expect(after).toHaveLength(0);
  });

  // Lazy upgrade — Issue #206. When verify succeeds against a legacy
  // PBKDF2-SHA256 hash stored before the Argon2id migration, the
  // adapter rewrites the row to scrypt in the same UoW. Subsequent
  // logins must continue to succeed against the upgraded hash.
  describe("lazy upgrade from legacy PBKDF2 to scrypt", () => {
    async function makeLegacyPbkdf2Hash(
      raw: string,
      iterations: number,
    ): Promise<string> {
      const salt = new Uint8Array(16);
      crypto.getRandomValues(salt);
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(raw),
        { name: "PBKDF2" },
        false,
        ["deriveBits"],
      );
      const derived = await crypto.subtle.deriveBits(
        { name: "PBKDF2", hash: "SHA-256", salt, iterations },
        key,
        256,
      );
      const toB64 = (bytes: Uint8Array): string => {
        let s = "";
        for (let i = 0; i < bytes.length; i++)
          s += String.fromCharCode(bytes[i] ?? 0);
        return btoa(s);
      };
      return `pbkdf2-sha256-v1$${iterations}$${toB64(salt)}$${toB64(
        new Uint8Array(derived),
      )}`;
    }

    for (const iterations of [100_000, 600_000] as const) {
      it(`re-hashes a verified iter=${iterations} legacy account to scrypt on logIn`, async () => {
        const container = getContainer();
        const seed = `lzy${iterations}`;
        const { userId } = await signUp({
          container,
          input: baseSignUp(seed),
        });
        const verifyTok = await readVerificationToken(
          container,
          userId,
          "email_verification",
        );
        await verifyEmail({ container, input: { token: verifyTok } });

        // Overwrite the account password with a legacy PBKDF2 hash and
        // freeze `updated_at` to a known sentinel so we can assert the
        // lazy upgrade bumps it.
        const password = strongPassword(seed);
        const legacyHash = await makeLegacyPbkdf2Hash(password, iterations);
        const frozenUpdatedAt = "2020-01-01T00:00:00.000Z";
        await container.db
          .update(schema.accounts)
          .set({ password: legacyHash, updatedAt: frozenUpdatedAt })
          .where(eq(schema.accounts.userId, userId));

        // 1st logIn: succeeds, lazy upgrade fires.
        const first = await logIn({
          container,
          input: {
            email: uniqueEmail(seed),
            password,
            userAgent: null,
            ipAddress: null,
          },
        });
        expect(first.userId).toBe(userId);

        const after = await container.db
          .select({
            password: schema.accounts.password,
            updatedAt: schema.accounts.updatedAt,
          })
          .from(schema.accounts)
          .where(eq(schema.accounts.userId, userId));
        const upgraded = after[0]?.password;
        expect(upgraded).toBeTruthy();
        expect(upgraded?.startsWith("$scrypt$")).toBe(true);
        expect(after[0]?.updatedAt).not.toBe(frozenUpdatedAt);

        // 2nd logIn: verifies against the new scrypt hash.
        const second = await logIn({
          container,
          input: {
            email: uniqueEmail(seed),
            password,
            userAgent: null,
            ipAddress: null,
          },
        });
        expect(second.userId).toBe(userId);

        // The hash on disk should still be scrypt after the second
        // login (no spurious re-hash on already-upgraded rows).
        const stillUpgraded = await container.db
          .select({ password: schema.accounts.password })
          .from(schema.accounts)
          .where(eq(schema.accounts.userId, userId));
        expect(stillUpgraded[0]?.password?.startsWith("$scrypt$")).toBe(true);
      });
    }
  });
});

describe("RevokeAllOtherSessions", () => {
  const getContainer = setupTestContainer();
  beforeEach(async () => {
    await truncateIdentityTables(getContainer());
  });

  it("revokes all sessions except the current one and returns the count", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("rvk001") });
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    // verifyEmail issues session 1 — this becomes the "current" session.
    const { sessionToken: currentToken } = await verifyEmail({
      container,
      input: { token: verifyToken },
    });

    // Create 4 more sessions via logIn.
    for (let i = 0; i < 4; i++) {
      await logIn({
        container,
        input: {
          email: uniqueEmail("rvk001"),
          password: strongPassword("rvk001"),
          userAgent: null,
          ipAddress: null,
        },
      });
    }

    const beforeRows = await container.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId));
    expect(beforeRows).toHaveLength(5);

    const { revokedCount } = await revokeAllOtherSessions({
      container,
      input: {
        actorUserId: userId as never,
        currentSessionToken: currentToken,
      },
    });

    expect(revokedCount).toBe(4);

    const afterRows = await container.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId));
    expect(afterRows).toHaveLength(1);
    expect(afterRows[0]?.token).toBe(currentToken);
  });
});

describe("RequestPasswordReset / ResetPassword", () => {
  const getContainer = setupTestContainer();
  beforeEach(async () => {
    await truncateIdentityTables(getContainer());
  });

  it("resets the password and revokes existing sessions", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("noa012") });
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token: verifyToken } });

    // Log in to seed a session.
    await logIn({
      container,
      input: {
        email: uniqueEmail("noa012"),
        password: strongPassword("noa012"),
        userAgent: null,
        ipAddress: null,
      },
    });

    await requestPasswordReset({
      container,
      input: { email: uniqueEmail("noa012") },
    });
    const resetToken = await readVerificationToken(
      container,
      userId,
      "password_reset",
    );

    const newPassword = "NewPass1234!";
    const result = await resetPassword({
      container,
      input: { token: resetToken, newPassword },
    });
    expect(result.userId).toBe(userId);

    // New password works.
    const reloggedIn = await logIn({
      container,
      input: {
        email: uniqueEmail("noa012"),
        password: newPassword,
        userAgent: null,
        ipAddress: null,
      },
    });
    expect(reloggedIn.userId).toBe(userId);
  });

  it("rejects a weak password", async () => {
    const container = getContainer();
    const { userId } = await signUp({
      container,
      input: baseSignUp("oscar1"),
    });
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token: verifyToken } });
    await requestPasswordReset({
      container,
      input: { email: uniqueEmail("oscar1") },
    });
    const resetToken = await readVerificationToken(
      container,
      userId,
      "password_reset",
    );

    try {
      await resetPassword({
        container,
        input: { token: resetToken, newPassword: "short" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });
});

describe("ChangePassword", () => {
  const getContainer = setupTestContainer();
  beforeEach(async () => {
    await truncateIdentityTables(getContainer());
  });

  async function activeUser(seed: string) {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp(seed) });
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    const session = await verifyEmail({
      container,
      input: { token: verifyToken },
    });
    return { userId, sessionToken: session.sessionToken };
  }

  it("changes the password when current is correct", async () => {
    const container = getContainer();
    const { userId, sessionToken } = await activeUser("paul01");

    await changePassword({
      container,
      input: {
        actorUserId: userId as never,
        currentPassword: strongPassword("paul01"),
        newPassword: "NewPass2345!",
        revokeOtherSessions: false,
        currentSessionToken: sessionToken,
      },
    });

    // Old password no longer works.
    try {
      await logIn({
        container,
        input: {
          email: uniqueEmail("paul01"),
          password: strongPassword("paul01"),
          userAgent: null,
          ipAddress: null,
        },
      });
      expect.fail("expected old password to fail");
    } catch (error) {
      expect(isAuthenticationError(error)).toBe(true);
    }
  });

  it("rejects an incorrect current password with invalid_credentials", async () => {
    const container = getContainer();
    const { userId, sessionToken } = await activeUser("quinn1");
    try {
      await changePassword({
        container,
        input: {
          actorUserId: userId as never,
          currentPassword: "WrongPass99!a",
          newPassword: "NewPass2345!",
          revokeOtherSessions: false,
          currentSessionToken: sessionToken,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isAuthenticationError(error)).toBe(true);
      if (isAuthenticationError(error)) {
        expect(error.code).toBe("invalid_credentials");
      }
    }
  });
});

describe("RequestEmailChange", () => {
  const getContainer = setupTestContainer();
  beforeEach(async () => {
    await truncateIdentityTables(getContainer());
  });

  async function activeMember(seed: string) {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp(seed) });
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token: verifyToken } });
    return { userId };
  }

  it("issues an email_change challenge for a valid request", async () => {
    const container = getContainer();
    const { userId } = await activeMember("eml001");

    await requestEmailChange({
      container,
      input: {
        actorUserId: userId as never,
        newEmail: "new_eml001@example.com",
        currentPassword: strongPassword("eml001"),
      },
    });

    const verificationRows = await container.db
      .select()
      .from(schema.verifications)
      .where(eq(schema.verifications.identifier, `email_change:${userId}`));
    expect(verificationRows).toHaveLength(1);
    const storedValue = JSON.parse(verificationRows[0]?.value ?? "{}") as {
      token: string;
      payload: Record<string, string>;
    };
    expect(storedValue.payload.newEmail).toBe("new_eml001@example.com");
  });

  it("invalidates the prior token when re-issued", async () => {
    const container = getContainer();
    const { userId } = await activeMember("eml005");

    // First request
    await requestEmailChange({
      container,
      input: {
        actorUserId: userId as never,
        newEmail: "first_eml005@example.com",
        currentPassword: strongPassword("eml005"),
      },
    });
    const firstToken = await readVerificationToken(
      container,
      userId,
      "email_change",
    );

    // Second request — the adapter deletes the prior row before inserting
    await requestEmailChange({
      container,
      input: {
        actorUserId: userId as never,
        newEmail: "second_eml005@example.com",
        currentPassword: strongPassword("eml005"),
      },
    });
    const secondToken = await readVerificationToken(
      container,
      userId,
      "email_change",
    );

    // First token is no longer in the DB so consume must fail.
    try {
      await verifyEmailChange({ container, input: { token: firstToken } });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("token_not_found");
      }
    }

    // Second token resolves to the new email address.
    const result = await verifyEmailChange({
      container,
      input: { token: secondToken },
    });
    expect(result.userId).toBe(userId);

    const userRows = await container.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(userRows[0]?.email).toBe("second_eml005@example.com");
  });

  it("rejects when the new email is already taken", async () => {
    const container = getContainer();
    const { userId } = await activeMember("eml002");
    // Register another user who holds the target email.
    await signUp({ container, input: baseSignUp("eml003") });

    try {
      await requestEmailChange({
        container,
        input: {
          actorUserId: userId as never,
          newEmail: uniqueEmail("eml003"),
          currentPassword: strongPassword("eml002"),
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("email_taken");
      }
    }
  });

  it("rejects an incorrect current password", async () => {
    const container = getContainer();
    const { userId } = await activeMember("eml004");

    try {
      await requestEmailChange({
        container,
        input: {
          actorUserId: userId as never,
          newEmail: "new_eml004@example.com",
          currentPassword: "WrongPass99!a",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isAuthenticationError(error)).toBe(true);
      if (isAuthenticationError(error)) {
        expect(error.code).toBe("invalid_credentials");
      }
    }
  });
});

describe("VerifyEmailChange", () => {
  const getContainer = setupTestContainer();
  beforeEach(async () => {
    await truncateIdentityTables(getContainer());
  });

  async function activeMember(seed: string) {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp(seed) });
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token: verifyToken } });
    return { userId };
  }

  it("updates the user's email to the new address", async () => {
    const container = getContainer();
    const { userId } = await activeMember("vec001");
    const newEmail = "changed_vec001@example.com";

    await requestEmailChange({
      container,
      input: {
        actorUserId: userId as never,
        newEmail,
        currentPassword: strongPassword("vec001"),
      },
    });

    const changeToken = await readVerificationToken(
      container,
      userId,
      "email_change",
    );
    const result = await verifyEmailChange({
      container,
      input: { token: changeToken },
    });
    expect(result.userId).toBe(userId);

    const userRows = await container.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    expect(userRows[0]?.email).toBe(newEmail);
  });

  it("rejects if the new email is claimed between request and verify", async () => {
    const container = getContainer();
    const { userId } = await activeMember("vec002");
    const targetEmail = "contested_vec002@example.com";

    await requestEmailChange({
      container,
      input: {
        actorUserId: userId as never,
        newEmail: targetEmail,
        currentPassword: strongPassword("vec002"),
      },
    });

    const changeToken = await readVerificationToken(
      container,
      userId,
      "email_change",
    );

    // Another user claims the target email before verification completes.
    await signUp({
      container,
      input: {
        username: "uvec003x",
        email: targetEmail,
        password: strongPassword("vec003"),
        displayName: null,
        acceptTerms: true,
      },
    });

    try {
      await verifyEmailChange({ container, input: { token: changeToken } });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("email_taken");
      }
    }
  });

  it("rejects an expired token", async () => {
    const container = getContainer();
    const { userId } = await activeMember("vec004");
    const newEmail = "expiry_vec004@example.com";

    await requestEmailChange({
      container,
      input: {
        actorUserId: userId as never,
        newEmail,
        currentPassword: strongPassword("vec004"),
      },
    });

    const changeToken = await readVerificationToken(
      container,
      userId,
      "email_change",
    );

    // Expire the token by backdating it in the DB.
    await container.db
      .update(schema.verifications)
      .set({ expiresAt: new Date(0).toISOString() })
      .where(eq(schema.verifications.identifier, `email_change:${userId}`));

    try {
      await verifyEmailChange({ container, input: { token: changeToken } });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("token_expired");
      }
    }
  });
});

describe("ChangeUsername", () => {
  const getContainer = setupTestContainer();
  beforeEach(async () => {
    await truncateIdentityTables(getContainer());
  });

  it("rejects rename within the 30-day cooldown", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("rita01") });
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token: verifyToken } });

    await changeUsername({
      container,
      input: { actorUserId: userId as never, newUsername: "rita-renamed" },
    });

    try {
      await changeUsername({
        container,
        input: { actorUserId: userId as never, newUsername: "rita-again01" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("username_change_too_soon");
      }
    }
  });

  it("rejects rename to an existing username", async () => {
    const container = getContainer();
    const a = await signUp({ container, input: baseSignUp("sam0001") });
    await signUp({ container, input: baseSignUp("sam0002") });

    const verifyToken = await readVerificationToken(
      container,
      a.userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token: verifyToken } });

    try {
      await changeUsername({
        container,
        input: { actorUserId: a.userId as never, newUsername: "usam0002" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("username_taken");
      }
    }
  });
});

describe("UpdateProfile", () => {
  const getContainer = setupTestContainer();
  beforeEach(async () => {
    await truncateIdentityTables(getContainer());
  });

  it("updates displayName", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("tia012") });
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token: verifyToken } });

    const result = await updateProfile({
      container,
      input: { actorUserId: userId as never, displayName: "Tia New" },
    });
    expect(result.user.displayName).toBe("Tia New");
  });

  it("rejects bio over 500 chars", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("uma012") });
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token: verifyToken } });

    try {
      await updateProfile({
        container,
        input: {
          actorUserId: userId as never,
          bio: "a".repeat(501),
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });
});

describe("Promote / Demote / Suspend / Reinstate", () => {
  const getContainer = setupTestContainer();
  beforeEach(async () => {
    await truncateIdentityTables(getContainer());
  });

  async function activateAdmin(seed: string) {
    const container: TestContainer = {
      ...getContainer(),
      setupTokenVerifier: new EnvSetupTokenVerifier({
        ADMIN_SETUP_TOKEN: "secret-token",
      }),
    };
    const { userId } = await adminSignUp({
      container,
      input: { ...baseSignUp(seed), setupToken: "secret-token" },
    });
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token: verifyToken } });
    return { container, userId };
  }

  async function activateMember(container: TestContainer, seed: string) {
    const { userId } = await signUp({ container, input: baseSignUp(seed) });
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token: verifyToken } });
    return userId;
  }

  it("admin can promote a member to admin", async () => {
    const { container, userId: adminId } = await activateAdmin("admon01");
    const memberId = await activateMember(container, "mem0001");

    await promoteUserToAdmin({
      container,
      input: {
        actorAdminId: adminId as never,
        targetUserId: memberId as never,
      },
    });

    const row = await container.db
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, memberId));
    expect(row[0]?.role).toBe("admin");
  });

  it("non-admin actor is forbidden from promoting", async () => {
    const container = getContainer();
    const a = await activateMember(container, "mem0010");
    const b = await activateMember(container, "mem0011");

    try {
      await promoteUserToAdmin({
        container,
        input: { actorAdminId: a as never, targetUserId: b as never },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isForbiddenError(error)).toBe(true);
    }
  });

  it("rejects demoting the last admin", async () => {
    const { container, userId: adminId } = await activateAdmin("admon02");
    try {
      await demoteAdmin({
        container,
        input: {
          actorAdminId: adminId as never,
          targetUserId: adminId as never,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("last_admin_protected");
      }
    }
  });

  it("can demote when another admin exists", async () => {
    const { container, userId: adminA } = await activateAdmin("admon03");
    // Make a second admin via promotion.
    const memberB = await activateMember(container, "mem0020");
    await promoteUserToAdmin({
      container,
      input: {
        actorAdminId: adminA as never,
        targetUserId: memberB as never,
      },
    });
    await demoteAdmin({
      container,
      input: {
        actorAdminId: adminA as never,
        targetUserId: memberB as never,
      },
    });
    const row = await container.db
      .select({ role: schema.users.role })
      .from(schema.users)
      .where(eq(schema.users.id, memberB));
    expect(row[0]?.role).toBe("member");
  });

  it("admin can suspend and reinstate an active member", async () => {
    const { container, userId: adminId } = await activateAdmin("admon04");
    const memberId = await activateMember(container, "mem0030");

    await suspendUser({
      container,
      input: {
        actorAdminId: adminId as never,
        targetUserId: memberId as never,
      },
    });
    let row = await container.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, memberId));
    const r1 = row[0];
    if (!r1) return;
    expect(deriveStatus(r1)).toBe("suspended");

    await reinstateUser({
      container,
      input: {
        actorAdminId: adminId as never,
        targetUserId: memberId as never,
      },
    });
    row = await container.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, memberId));
    const r2 = row[0];
    if (!r2) return;
    expect(deriveStatus(r2)).toBe("active");
  });

  it("rejects suspending a pending user", async () => {
    const { container, userId: adminId } = await activateAdmin("admon05");
    const pending = await signUp({ container, input: baseSignUp("pdg0001") });

    try {
      await suspendUser({
        container,
        input: {
          actorAdminId: adminId as never,
          targetUserId: pending.userId as never,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("user_not_active");
      }
    }
  });

  it("rejects reinstating an active user", async () => {
    const { container, userId: adminId } = await activateAdmin("admon06");
    const memberId = await activateMember(container, "mem0040");

    try {
      await reinstateUser({
        container,
        input: {
          actorAdminId: adminId as never,
          targetUserId: memberId as never,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("user_not_suspended");
      }
    }
  });
});

describe("DeleteAccount", () => {
  const getContainer = setupTestContainer();
  beforeEach(async () => {
    await truncateIdentityTables(getContainer());
  });

  it("rejects when confirmation does not match", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("vic012") });
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token: verifyToken } });
    try {
      await deleteAccount({
        container,
        input: { actorUserId: userId as never, confirmation: "wrong" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("confirmation_mismatch");
      }
    }
  });

  it("rejects deleting the only admin", async () => {
    const container: TestContainer = {
      ...getContainer(),
      setupTokenVerifier: new EnvSetupTokenVerifier({
        ADMIN_SETUP_TOKEN: "secret-token",
      }),
    };
    const { userId } = await adminSignUp({
      container,
      input: { ...baseSignUp("admon20"), setupToken: "secret-token" },
    });
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token: verifyToken } });

    try {
      await deleteAccount({
        container,
        input: { actorUserId: userId as never, confirmation: "uadmon20" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("last_admin_protected");
      }
    }
  });

  it("marks user as deleted, purges credentials, revokes sessions", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("wes012") });
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token: verifyToken } });

    await deleteAccount({
      container,
      input: { actorUserId: userId as never, confirmation: "uwes012" },
    });

    const userRow = await container.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, userId));
    const u = userRow[0];
    if (!u) return;
    expect(deriveStatus(u)).toBe("deleted");
    expect(u.deletedAt).not.toBeNull();

    const accountRows = await container.db
      .select()
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, userId));
    expect(accountRows).toHaveLength(0);

    const sessionRows = await container.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, userId));
    expect(sessionRows).toHaveLength(0);

    // Subsequent login attempt fails (verifyPassword returns null for
    // deleted user).
    try {
      await logIn({
        container,
        input: {
          email: uniqueEmail("wes012"),
          password: strongPassword("wes012"),
          userAgent: null,
          ipAddress: null,
        },
      });
      expect.fail("expected login to fail");
    } catch (error) {
      expect(isAuthenticationError(error)).toBe(true);
    }
  });

  it("permanently reserves the username after deletion", async () => {
    const container = getContainer();
    const { userId } = await signUp({ container, input: baseSignUp("xan012") });
    const verifyToken = await readVerificationToken(
      container,
      userId,
      "email_verification",
    );
    await verifyEmail({ container, input: { token: verifyToken } });
    await deleteAccount({
      container,
      input: { actorUserId: userId as never, confirmation: "uxan012" },
    });

    try {
      await signUp({
        container,
        input: {
          ...baseSignUp("xan012"),
          email: "different@example.com",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("username_taken");
      }
    }
  });
});
