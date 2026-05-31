import { env } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import { WebCryptoSecretBox } from "@/core/adapters/security/secretBox";
import type { UnitOfWorkContext } from "@/core/application/execution/unitOfWork";
import {
  isSecretBoxError,
  SecretBoxErrorCode,
} from "@/core/domain/adminSettings/ports/secretBox";
import { User } from "@/core/domain/identity/entity";
import {
  EmailAddress,
  Role,
  Username,
} from "@/core/domain/identity/valueObject";
import { createTestContainer } from "../../__tests__/helpers";
import {
  isConflictError,
  isForbiddenError,
  isSystemError,
  SystemErrorCode,
} from "../../errors";
import { reencryptApiKey } from "../reencryptApiKey";
import { updateLLMConfig } from "../updateLLMConfig";

// Two distinct valid AES-256 keys: VALID_KEY mirrors the helper's
// TEST_SECRET_BOX_KEY (the "new"/current key), PREVIOUS_KEY is the
// outgoing key for a rotation.
const NEW_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const PREVIOUS_KEY = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";
// A third, unrelated valid AES-256 key used as the *wrong* previous key:
// distinct from both NEW_KEY and PREVIOUS_KEY, so a row encrypted under
// PREVIOUS_KEY cannot decrypt under it (AES-GCM tag mismatch).
const WRONG_PREVIOUS_KEY = "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI=";

const ADMIN_ID = "01950000-0000-7000-8000-0000000037a1";
const MEMBER_ID = "01950000-0000-7000-8000-0000000037a2";

async function truncate(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM instance_settings"),
    env.DB.prepare("DELETE FROM accounts"),
    env.DB.prepare("DELETE FROM users"),
    env.DB.prepare("DELETE FROM directories"),
    env.DB.prepare("DELETE FROM outbox_events"),
  ]);
}

async function seedUser(opts: {
  id: string;
  username: string;
  email: string;
  role: "admin" | "member";
}): Promise<void> {
  const now = new Date("2026-01-01T00:00:00.000Z").toISOString();
  await env.DB.prepare(
    `INSERT INTO users (id, name, email, email_verified, image, created_at,
       updated_at, username, display_username, role, banned, ban_reason,
       ban_expires, bio, avatar_media_id, last_username_changed_at, deleted_at)
     VALUES (?, ?, ?, 1, NULL, ?, ?, ?, NULL, ?, 0, NULL, NULL, NULL, NULL, NULL, NULL)`,
  )
    .bind(
      opts.id,
      opts.username,
      opts.email,
      now,
      now,
      opts.username,
      opts.role,
    )
    .run();
  User.reconstruct({
    id: opts.id,
    username: Username.create(opts.username) as unknown as string,
    email: EmailAddress.create(opts.email) as unknown as string,
    displayName: opts.username,
    bio: null,
    avatarMediaId: null,
    status: "active",
    role: Role.create(opts.role) as unknown as string,
    version: 0,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    lastUsernameChangedAt: null,
  });
}

beforeEach(async () => {
  await truncate();
});

/**
 * Seed a `db`-source LLM config whose ciphertext is encrypted under
 * `keyBase64`, by running `updateLLMConfig` with a container wired to that
 * key. Returns the persisted ciphertext.
 */
async function seedDbLlmConfig(keyBase64: string): Promise<string> {
  const container = {
    ...createTestContainer(),
    secretBox: new WebCryptoSecretBox(keyBase64),
  };
  await updateLLMConfig({
    container,
    input: {
      actorUserId: ADMIN_ID,
      provider: "anthropic",
      model: "claude-3-5-sonnet-latest",
      baseURL: null,
      apiKeyPlain: "sk-secret-key",
    },
  });
  const rows = await container.db.select().from(schema.instanceSettings);
  const cipher = rows[0]?.llmApiKeyCiphertext;
  if (cipher === null || cipher === undefined) {
    throw new Error("seed failed: no ciphertext");
  }
  return cipher;
}

describe("reencryptApiKey", () => {
  it("re-encrypts a db row from the previous key to the new key (decryptable under the new key)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const oldCipher = await seedDbLlmConfig(PREVIOUS_KEY);

    const container = {
      ...createTestContainer(),
      secretBox: new WebCryptoSecretBox(NEW_KEY),
      secretBoxPrevious: new WebCryptoSecretBox(PREVIOUS_KEY),
    };

    const result = await reencryptApiKey({
      container,
      input: { actorUserId: ADMIN_ID },
    });
    expect(result).toEqual({ reencrypted: true, skipped: null });

    const rows = await container.db.select().from(schema.instanceSettings);
    const newCipher = rows[0]?.llmApiKeyCiphertext;
    expect(newCipher).not.toBeNull();
    expect(newCipher).not.toBe(oldCipher);
    // The new ciphertext must round-trip under the new key.
    await expect(
      new WebCryptoSecretBox(NEW_KEY).decrypt(newCipher as string),
    ).resolves.toBe("sk-secret-key");
  });

  it("is idempotent: a second run skips with already-new-key", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    await seedDbLlmConfig(PREVIOUS_KEY);

    const container = {
      ...createTestContainer(),
      secretBox: new WebCryptoSecretBox(NEW_KEY),
      secretBoxPrevious: new WebCryptoSecretBox(PREVIOUS_KEY),
    };

    const first = await reencryptApiKey({
      container,
      input: { actorUserId: ADMIN_ID },
    });
    expect(first.reencrypted).toBe(true);

    const second = await reencryptApiKey({
      container,
      input: { actorUserId: ADMIN_ID },
    });
    expect(second).toEqual({ reencrypted: false, skipped: "already-new-key" });
  });

  it("skips env-sourced config with not-db", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    // No row seeded → repository materialises the default (apiKeySource='env').
    const container = {
      ...createTestContainer(),
      secretBox: new WebCryptoSecretBox(NEW_KEY),
      secretBoxPrevious: new WebCryptoSecretBox(PREVIOUS_KEY),
    };

    const result = await reencryptApiKey({
      container,
      input: { actorUserId: ADMIN_ID },
    });
    expect(result).toEqual({ reencrypted: false, skipped: "not-db" });
  });

  it("throws KeyUnavailable when the row needs the previous key but none is configured", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    await seedDbLlmConfig(PREVIOUS_KEY);

    // New key configured, but no previous key for the old-key row.
    const container = {
      ...createTestContainer(),
      secretBox: new WebCryptoSecretBox(NEW_KEY),
      secretBoxPrevious: null,
    };

    await expect(
      reencryptApiKey({ container, input: { actorUserId: ADMIN_ID } }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isSecretBoxError(error)).toBe(true);
      if (isSecretBoxError(error)) {
        expect(error.code).toBe(SecretBoxErrorCode.KeyUnavailable);
      }
      return true;
    });
  });

  it("surfaces a DataIntegrityError (no silent skip, no mutation) for a db row whose ciphertext is NULL", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    // A `db` source with a NULL ciphertext is a state the domain VO forbids
    // (`LLMConfig.create` rejects it, enforced again on rehydration). It is
    // unrepresentable through `updateLLMConfig`, so seed a valid db row and
    // null the ciphertext column directly to simulate corruption. The repo's
    // `get()` must reject it as a data-integrity violation rather than the
    // usecase silently skipping it.
    await seedDbLlmConfig(NEW_KEY);

    const base = createTestContainer();
    const before = await base.db
      .select()
      .from(schema.instanceSettings)
      .where(eq(schema.instanceSettings.id, "singleton"));
    const versionBefore = before[0]?.version;
    await base.db
      .update(schema.instanceSettings)
      .set({ llmApiKeyCiphertext: null })
      .where(eq(schema.instanceSettings.id, "singleton"));

    const container = {
      ...base,
      secretBox: new WebCryptoSecretBox(NEW_KEY),
      secretBoxPrevious: new WebCryptoSecretBox(PREVIOUS_KEY),
    };

    await expect(
      reencryptApiKey({ container, input: { actorUserId: ADMIN_ID } }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        isSystemError(error) &&
        error.code === SystemErrorCode.DataIntegrityError,
    );

    // The row must be untouched: version unchanged, ciphertext still NULL.
    const after = await container.db
      .select()
      .from(schema.instanceSettings)
      .where(eq(schema.instanceSettings.id, "singleton"));
    expect(after[0]?.version).toBe(versionBefore);
    expect(after[0]?.llmApiKeyCiphertext).toBeNull();
  });

  it("throws DecryptFailed (no skip, no row mutation) when the configured previous key is the wrong key", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const oldCipher = await seedDbLlmConfig(PREVIOUS_KEY);

    const base = createTestContainer();
    const before = await base.db
      .select()
      .from(schema.instanceSettings)
      .where(eq(schema.instanceSettings.id, "singleton"));
    const versionBefore = before[0]?.version;

    // The row is encrypted under PREVIOUS_KEY, but the operator configured a
    // *different* (wrong) previous key. The current-key decrypt fails with
    // DecryptFailed, the fallback decrypt under WRONG_PREVIOUS_KEY also fails
    // (AES-GCM tag mismatch) — there is no silent no-op skip and no fabricated
    // plaintext, so DecryptFailed propagates.
    const container = {
      ...base,
      secretBox: new WebCryptoSecretBox(NEW_KEY),
      secretBoxPrevious: new WebCryptoSecretBox(WRONG_PREVIOUS_KEY),
    };

    await expect(
      reencryptApiKey({ container, input: { actorUserId: ADMIN_ID } }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isSecretBoxError(error)).toBe(true);
      if (isSecretBoxError(error)) {
        expect(error.code).toBe(SecretBoxErrorCode.DecryptFailed);
      }
      return true;
    });

    // The row must be untouched: version unchanged, ciphertext still the
    // original old-key value (not rewritten / corrupted).
    const after = await container.db
      .select()
      .from(schema.instanceSettings)
      .where(eq(schema.instanceSettings.id, "singleton"));
    expect(after[0]?.version).toBe(versionBefore);
    expect(after[0]?.llmApiKeyCiphertext).toBe(oldCipher);
  });

  it("rejects a non-admin actor with ForbiddenError", async () => {
    await seedUser({
      id: MEMBER_ID,
      username: "bob",
      email: "bob@example.com",
      role: "member",
    });
    // Authorization runs in the first (read-only) UoW before any config is
    // read, so a non-admin is rejected regardless of the stored config.
    const container = {
      ...createTestContainer(),
      secretBox: new WebCryptoSecretBox(NEW_KEY),
      secretBoxPrevious: new WebCryptoSecretBox(PREVIOUS_KEY),
    };

    await expect(
      reencryptApiKey({ container, input: { actorUserId: MEMBER_ID } }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isForbiddenError(error)).toBe(true);
      return true;
    });
  });

  it("raises ConflictError when the settings version changes between read and save", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    await seedDbLlmConfig(PREVIOUS_KEY);

    const base = createTestContainer();
    const realProvider = base.unitOfWorkProvider;

    // The save UoW (phase 3) re-reads the latest version via `get()`, then
    // `save()`s under the captured token. Wrap the provider so that on the
    // *second* `run` (phase 3), the `get()` first commits a concurrent admin
    // write (a fresh, fully-committed UoW), bumping the persisted version.
    // The token captured by phase 3's `get()` is then stale relative to the
    // row at `save()` time → ConflictError. Awaiting inside the wrapped
    // `get()` keeps the race deterministic.
    let runCount = 0;
    const racingProvider = {
      run<T>(fn: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T> {
        runCount += 1;
        const isSaveUoW = runCount === 2;
        return realProvider.run(async (ctx) => {
          const wrapped: UnitOfWorkContext = isSaveUoW
            ? {
                ...ctx,
                instanceSettingsRepository: {
                  async get() {
                    const captured = await ctx.instanceSettingsRepository.get();
                    // Concurrent committed write between get() and save().
                    await updateLLMConfig({
                      container: {
                        ...base,
                        secretBox: new WebCryptoSecretBox(NEW_KEY),
                      },
                      input: {
                        actorUserId: ADMIN_ID,
                        provider: "anthropic",
                        model: "claude-3-7-sonnet-latest",
                        baseURL: null,
                        apiKeyPlain: "sk-rotated-meanwhile",
                      },
                    });
                    return captured;
                  },
                  save(entity, expectedVersion) {
                    return ctx.instanceSettingsRepository.save(
                      entity,
                      expectedVersion,
                    );
                  },
                },
              }
            : ctx;
          return fn(wrapped);
        });
      },
    };

    const container = {
      ...base,
      unitOfWorkProvider: racingProvider,
      secretBox: new WebCryptoSecretBox(NEW_KEY),
      secretBoxPrevious: new WebCryptoSecretBox(PREVIOUS_KEY),
    };

    await expect(
      reencryptApiKey({ container, input: { actorUserId: ADMIN_ID } }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isConflictError(error)).toBe(true);
      return true;
    });
  });
});
