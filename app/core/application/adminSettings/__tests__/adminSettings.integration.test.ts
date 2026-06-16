import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import { signUp } from "@/core/application/identity/signUp";
import type {
  UsageMetricsProvider,
  UsageMetricsSnapshot,
} from "@/core/application/ports/usageMetricsProvider";
import { BUILTIN_DESIGN_TOKENS } from "@/core/domain/adminSettings/defaults";
import { InstanceSettings } from "@/core/domain/adminSettings/entity";
import { AdminSettingsErrorCode } from "@/core/domain/adminSettings/errorCode";
import type {
  LLMConnectionPingResult,
  LLMConnectionTester,
} from "@/core/domain/adminSettings/ports/llmConnectionTester";
import type {
  SpeechConnectionPingResult,
  SpeechConnectionTester,
} from "@/core/domain/adminSettings/ports/speechConnectionTester";
import type {
  LLMConfig,
  SpeechRecognitionConfig,
} from "@/core/domain/adminSettings/valueObject";
import { isBusinessRuleError } from "@/core/domain/error";
import { User } from "@/core/domain/identity/entity";
import {
  EmailAddress,
  Role,
  Username,
} from "@/core/domain/identity/valueObject";
import { createTestContainer } from "../../__tests__/helpers";
import { isForbiddenError, isNotFoundError } from "../../errors";
import { getInstanceSettings } from "../getInstanceSettings";
import { getUsageMetrics } from "../getUsageMetrics";
import { resetAllPromptTemplates } from "../resetAllPromptTemplates";
import { resetDesignTokens } from "../resetDesignTokens";
import { resetPromptTemplate } from "../resetPromptTemplate";
import { testLLMConnection } from "../testLLMConnection";
import { testSpeechConnection } from "../testSpeechConnection";
import { toggleRegistrationPolicy } from "../toggleRegistrationPolicy";
import { updateDesignTokens } from "../updateDesignTokens";
import { updateInstanceLimits } from "../updateInstanceLimits";
import { updateLLMConfig } from "../updateLLMConfig";
import { updatePromptTemplate } from "../updatePromptTemplate";
import { updateSpeechConfig } from "../updateSpeechConfig";
import { updateUserPromptOverride } from "../updateUserPromptOverride";

// AdminSettings tables are not covered by the global `setup.ts` truncate
// (it only wipes todo + outbox). These tests own per-test cleanup of the
// identity + adminSettings tables so each `it()` starts from a clean slate.
async function truncateAdminTables(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM user_prompt_overrides"),
    env.DB.prepare("DELETE FROM instance_settings"),
    env.DB.prepare("DELETE FROM accounts"),
    env.DB.prepare("DELETE FROM users"),
    env.DB.prepare("DELETE FROM directories"),
    env.DB.prepare("DELETE FROM outbox_events"),
  ]);
}

beforeEach(async () => {
  await truncateAdminTables();
});

async function seedUser(opts: {
  id: string;
  username: string;
  email: string;
  role: "admin" | "member";
  status?: "active" | "deleted";
}): Promise<void> {
  const now = new Date("2026-01-01T00:00:00.000Z").toISOString();
  const status = opts.status ?? "active";
  const emailVerified = status === "active" ? 1 : 0;
  const deletedAt = status === "deleted" ? now : null;
  await env.DB.prepare(
    `INSERT INTO users (id, name, email, email_verified, image, created_at,
       updated_at, username, display_username, role, banned, ban_reason,
       ban_expires, bio, avatar_media_id, last_username_changed_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, 0, NULL, NULL, NULL, NULL, NULL, ?)`,
  )
    .bind(
      opts.id,
      opts.username,
      opts.email,
      emailVerified,
      now,
      now,
      opts.username,
      opts.role,
      deletedAt,
    )
    .run();
  // Sanity-check the seeded row decodes back through the domain factory.
  User.reconstruct({
    id: opts.id,
    username: Username.create(opts.username) as unknown as string,
    email: EmailAddress.create(opts.email) as unknown as string,
    displayName: opts.username,
    bio: null,
    avatarMediaId: null,
    status,
    role: Role.create(opts.role) as unknown as string,
    version: 0,
    createdAt: new Date(now),
    updatedAt: new Date(now),
    lastUsernameChangedAt: null,
  });
}

const ADMIN_ID = "01950000-0000-7000-8000-00000000ad01";
const MEMBER_ID = "01950000-0000-7000-8000-00000000ad02";

class StubLLMConnectionTester implements LLMConnectionTester {
  readonly calls: Array<{ cfg: LLMConfig; apiKey: string }> = [];
  constructor(private readonly result: LLMConnectionPingResult) {}
  async ping(cfg: LLMConfig, apiKey: string): Promise<LLMConnectionPingResult> {
    this.calls.push({ cfg, apiKey });
    return this.result;
  }
}

class StubSpeechConnectionTester implements SpeechConnectionTester {
  readonly calls: Array<{ cfg: SpeechRecognitionConfig; apiKey: string }> = [];
  constructor(private readonly result: SpeechConnectionPingResult) {}
  async ping(
    cfg: SpeechRecognitionConfig,
    apiKey: string,
  ): Promise<SpeechConnectionPingResult> {
    this.calls.push({ cfg, apiKey });
    return this.result;
  }
}

class StubUsageMetricsProvider implements UsageMetricsProvider {
  constructor(private readonly snapshot: UsageMetricsSnapshot) {}
  async collect(): Promise<UsageMetricsSnapshot> {
    return this.snapshot;
  }
}

// ---------- GetInstanceSettings ----------

describe("getInstanceSettings", () => {
  it("admin gets a defaulted DTO with apiKeyMasked = null when no row exists", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();

    const { settings } = await getInstanceSettings({
      container,
      input: { actorUserId: ADMIN_ID },
    });
    expect(settings.llm.apiKeySource).toBe("env");
    expect(settings.llm.apiKeyMasked).toBeNull();
    expect(settings.registration.open).toBe(true);
  });

  it("member is rejected with ForbiddenError", async () => {
    await seedUser({
      id: MEMBER_ID,
      username: "bob",
      email: "bob@example.com",
      role: "member",
    });
    const container = createTestContainer();
    let caught: unknown;
    try {
      await getInstanceSettings({
        container,
        input: { actorUserId: MEMBER_ID },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isForbiddenError(caught)).toBe(true);
  });

  it("unknown actor is rejected with NotFoundError", async () => {
    const container = createTestContainer();
    let caught: unknown;
    try {
      await getInstanceSettings({
        container,
        input: { actorUserId: "01950000-0000-7000-8000-deadbeef0000" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isNotFoundError(caught)).toBe(true);
  });
});

// ---------- UpdateLLMConfig ----------

describe("updateLLMConfig", () => {
  it("admin storing a new api key encrypts it and persists apiKeySource='db'", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    await updateLLMConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        baseURL: null,
        apiKeyPlain: "sk-secret",
      },
    });

    const rows = await container.db.select().from(schema.instanceSettings);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.llmApiKeySource).toBe("db");
    expect(rows[0]?.llmApiKeyCiphertext).not.toBeNull();
    expect(rows[0]?.llmApiKeyCiphertext).not.toBe("sk-secret");
  });

  it("forces apiKeySource='env' when adminSettingsEnv.apiKey is configured", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    const container = {
      ...baseContainer,
      adminSettingsEnv: {
        apiKey: "sk-from-env",
        provider: null,
        model: null,
        baseURL: null,
      },
    };

    await updateLLMConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        baseURL: null,
        apiKeyPlain: "sk-ignored",
      },
    });

    const rows = await baseContainer.db.select().from(schema.instanceSettings);
    expect(rows[0]?.llmApiKeySource).toBe("env");
    expect(rows[0]?.llmApiKeyCiphertext).toBeNull();
  });

  it("rejects an empty model string with BusinessRuleError (ValidationError equivalent)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    let caught: unknown;
    try {
      await updateLLMConfig({
        container,
        input: {
          actorUserId: ADMIN_ID,
          provider: "anthropic",
          model: "   ",
          baseURL: null,
          apiKeyPlain: "sk-secret",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isBusinessRuleError(caught)).toBe(true);
  });

  it("member is rejected with ForbiddenError", async () => {
    await seedUser({
      id: MEMBER_ID,
      username: "bob",
      email: "bob@example.com",
      role: "member",
    });
    const container = createTestContainer();
    let caught: unknown;
    try {
      await updateLLMConfig({
        container,
        input: {
          actorUserId: MEMBER_ID,
          provider: "anthropic",
          model: "claude-3-5-sonnet-latest",
          baseURL: null,
          apiKeyPlain: "sk-secret",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isForbiddenError(caught)).toBe(true);
  });

  it("changing provider requires apiKeyPlain (ADR-008)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    // Seed the persisted aggregate with provider=anthropic + a DB-source key.
    await updateLLMConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        baseURL: null,
        apiKeyPlain: "sk-anthropic",
      },
    });

    let caught: unknown;
    try {
      await updateLLMConfig({
        container,
        input: {
          actorUserId: ADMIN_ID,
          provider: "openai",
          model: "gpt-4o",
          baseURL: null,
          apiKeyPlain: null,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isBusinessRuleError(caught)).toBe(true);
    expect((caught as { code?: string }).code).toBe(
      AdminSettingsErrorCode.ProviderChangedRequiresApiKey,
    );
  });

  it("changing provider with a fresh apiKeyPlain succeeds and re-encrypts (ADR-008)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    await updateLLMConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        baseURL: null,
        apiKeyPlain: "sk-anthropic",
      },
    });

    await updateLLMConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "openai",
        model: "gpt-4o",
        baseURL: "https://api.openai.com/v1",
        apiKeyPlain: "sk-openai",
      },
    });

    const rows = await container.db.select().from(schema.instanceSettings);
    expect(rows[0]?.llmProvider).toBe("openai");
    expect(rows[0]?.llmBaseUrl).toBe("https://api.openai.com/v1");
    expect(rows[0]?.llmApiKeySource).toBe("db");
    expect(rows[0]?.llmApiKeyCiphertext).not.toBeNull();
    expect(rows[0]?.llmApiKeyCiphertext).not.toBe("sk-openai");
  });

  it("silent-skips provider/model/baseURL writes when those fields are env-overridden", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    // Seed the persisted aggregate with provider=openai + a DB-source key
    // and a custom base URL — these are the values the silent-skip path
    // must preserve.
    await updateLLMConfig({
      container: baseContainer,
      input: {
        actorUserId: ADMIN_ID,
        provider: "openai",
        model: "gpt-4o",
        baseURL: "https://api.openai.com/v1",
        apiKeyPlain: "sk-openai-original",
      },
    });
    const before = await baseContainer.db
      .select()
      .from(schema.instanceSettings);
    const beforeCiphertext = before[0]?.llmApiKeyCiphertext;
    expect(before[0]?.llmProvider).toBe("openai");
    expect(before[0]?.llmModel).toBe("gpt-4o");
    expect(before[0]?.llmBaseUrl).toBe("https://api.openai.com/v1");

    // Now flip on env overrides for all three "silent-skip" fields and
    // attempt to overwrite each with a different value. The DB must stay
    // pinned to the original values.
    const container = {
      ...baseContainer,
      adminSettingsEnv: {
        apiKey: null,
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        baseURL: "https://example.invalid/v1",
      },
    };
    await updateLLMConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "gemini",
        model: "gemini-1.5-pro",
        baseURL: null,
        apiKeyPlain: null,
      },
    });

    const after = await baseContainer.db.select().from(schema.instanceSettings);
    expect(after[0]?.llmProvider).toBe("openai");
    expect(after[0]?.llmModel).toBe("gpt-4o");
    expect(after[0]?.llmBaseUrl).toBe("https://api.openai.com/v1");
    // The unchanged ciphertext anchors the broader "no-op on env-pinned
    // fields" claim — the encrypt → drop path inside the usecase does not
    // perturb the persisted column.
    expect(after[0]?.llmApiKeyCiphertext).toBe(beforeCiphertext);
  });

  it("logger.warn is invoked with { fields } when silent-skip fires (W-T-004)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    await updateLLMConfig({
      container: baseContainer,
      input: {
        actorUserId: ADMIN_ID,
        provider: "openai",
        model: "gpt-4o",
        baseURL: "https://api.openai.com/v1",
        apiKeyPlain: "sk-openai",
      },
    });

    const warnSpy = vi.fn();
    const container = {
      ...baseContainer,
      logger: {
        info: () => {},
        warn: warnSpy,
        error: () => {},
      },
      adminSettingsEnv: {
        apiKey: null,
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        baseURL: "https://example.invalid/v1",
      },
    };
    await updateLLMConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "gemini",
        model: "gemini-1.5-pro",
        baseURL: null,
        apiKeyPlain: null,
      },
    });

    expect(warnSpy).toHaveBeenCalledWith("admin_llm_env_override_skip", {
      fields: ["provider", "model", "baseURL"],
    });
  });

  it("composite silent-skip: env.provider + env.apiKey set, input carries apiKeyPlain + different provider (W-T-005)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    await updateLLMConfig({
      container: baseContainer,
      input: {
        actorUserId: ADMIN_ID,
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        baseURL: null,
        apiKeyPlain: "sk-anthropic-original",
      },
    });
    const before = await baseContainer.db
      .select()
      .from(schema.instanceSettings);
    const beforeCiphertext = before[0]?.llmApiKeyCiphertext;

    // env locks both provider and apiKey; input tries to switch provider AND
    // supplies a new apiKeyPlain. Both must be silent-skipped: provider stays
    // anthropic, ciphertext stays at the original (env.apiKey wins via
    // assertEnvOverride, dropping the freshly-encrypted ciphertext).
    const container = {
      ...baseContainer,
      adminSettingsEnv: {
        apiKey: "sk-env-active",
        provider: "anthropic",
        model: null,
        baseURL: null,
      },
    };
    await updateLLMConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "openai",
        model: "gpt-4o",
        baseURL: "https://api.openai.com/v1",
        apiKeyPlain: "sk-openai-new",
      },
    });

    const after = await baseContainer.db.select().from(schema.instanceSettings);
    expect(after[0]?.llmProvider).toBe("anthropic");
    // env.apiKey is set so the persisted ciphertext must be cleared by
    // `assertEnvOverride` (apiKeySource → "env", ciphertext → null).
    expect(after[0]?.llmApiKeySource).toBe("env");
    expect(after[0]?.llmApiKeyCiphertext).toBeNull();
    // Sanity: the input ciphertext-equivalent must never have been persisted.
    expect(after[0]?.llmApiKeyCiphertext).not.toBe(beforeCiphertext);
  });

  it("silent-skip reconciles provider × baseURL invariant (B-UC-001)", async () => {
    // Regression for B-UC-001: env pins provider=anthropic (baseURL must be
    // null per LLMConfig.create invariant) while the DB still holds
    // provider=anthropic + baseURL=null. A direct POST with provider=openai +
    // baseURL=https://... must NOT trip BusinessRuleError(InvalidLLMBaseURL):
    // silent skip forces effectiveProvider=anthropic, and the reconcile step
    // forces baseURL → null before LLMConfig.create.
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    await updateLLMConfig({
      container: baseContainer,
      input: {
        actorUserId: ADMIN_ID,
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        baseURL: null,
        apiKeyPlain: "sk-anthropic",
      },
    });
    const before = await baseContainer.db
      .select()
      .from(schema.instanceSettings);
    expect(before[0]?.llmProvider).toBe("anthropic");
    expect(before[0]?.llmBaseUrl).toBeNull();

    const container = {
      ...baseContainer,
      adminSettingsEnv: {
        apiKey: null,
        provider: "anthropic",
        model: null,
        baseURL: null,
      },
    };
    // Must NOT throw — silent skip + reconcile keeps the persisted invariant.
    await updateLLMConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "openai",
        model: "claude-3-5-sonnet-latest",
        baseURL: "https://api.openai.com/v1",
        apiKeyPlain: null,
      },
    });

    const after = await baseContainer.db.select().from(schema.instanceSettings);
    expect(after[0]?.llmProvider).toBe("anthropic");
    expect(after[0]?.llmBaseUrl).toBeNull();
  });

  it("env-pinned provider suppresses ProviderChangedRequiresApiKey on input that would otherwise change provider", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    await updateLLMConfig({
      container: baseContainer,
      input: {
        actorUserId: ADMIN_ID,
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        baseURL: null,
        apiKeyPlain: "sk-anthropic",
      },
    });

    // With provider env-pinned, an input attempting to switch to a
    // different provider without apiKeyPlain must succeed (the input
    // provider field is silent-skipped, so the "provider changed" guard
    // never fires).
    const container = {
      ...baseContainer,
      adminSettingsEnv: {
        apiKey: null,
        provider: "anthropic",
        model: null,
        baseURL: null,
      },
    };
    await updateLLMConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "openai",
        model: "claude-3-5-sonnet-latest",
        baseURL: null,
        apiKeyPlain: null,
      },
    });

    const rows = await baseContainer.db.select().from(schema.instanceSettings);
    expect(rows[0]?.llmProvider).toBe("anthropic");
  });

  it("preserves the existing ciphertext when provider is unchanged and apiKeyPlain is null", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    await updateLLMConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        baseURL: null,
        apiKeyPlain: "sk-anthropic",
      },
    });
    const initial = await container.db.select().from(schema.instanceSettings);
    const initialCiphertext = initial[0]?.llmApiKeyCiphertext;
    expect(initialCiphertext).not.toBeNull();

    await updateLLMConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "anthropic",
        model: "claude-3-7-sonnet-latest",
        baseURL: null,
        apiKeyPlain: null,
      },
    });

    const after = await container.db.select().from(schema.instanceSettings);
    expect(after[0]?.llmModel).toBe("claude-3-7-sonnet-latest");
    expect(after[0]?.llmApiKeySource).toBe("db");
    expect(after[0]?.llmApiKeyCiphertext).toBe(initialCiphertext);
  });
});

// ---------- TestLLMConnection ----------

describe("testLLMConnection", () => {
  it("returns ok=true with latencyMs >= 0 on a successful ping", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    const container = {
      ...baseContainer,
      adminSettingsEnv: {
        apiKey: "sk-env",
        provider: null,
        model: null,
        baseURL: null,
      },
      llmConnectionTester: new StubLLMConnectionTester({
        ok: true,
        latencyMs: 42,
      }),
    };

    const result = await testLLMConnection({
      container,
      input: { actorUserId: ADMIN_ID, useDraft: false, draftConfig: null },
    });
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBe(42);
    expect(result.error).toBeNull();
  });

  it("returns ok=false with an error message when the tester reports failure", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    const container = {
      ...baseContainer,
      adminSettingsEnv: {
        apiKey: "sk-env",
        provider: null,
        model: null,
        baseURL: null,
      },
      llmConnectionTester: new StubLLMConnectionTester({
        ok: false,
        latencyMs: 12,
        error: "invalid_api_key",
      }),
    };

    const result = await testLLMConnection({
      container,
      input: { actorUserId: ADMIN_ID, useDraft: false, draftConfig: null },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_api_key");
  });

  it("useDraft=true forwards the draftConfig to the tester (provider/model/baseURL) instead of the persisted row", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    const stub = new StubLLMConnectionTester({ ok: true, latencyMs: 7 });
    const container = {
      ...baseContainer,
      adminSettingsEnv: {
        apiKey: "sk-env",
        provider: null,
        model: null,
        baseURL: null,
      },
      llmConnectionTester: stub,
    };

    const result = await testLLMConnection({
      container,
      input: {
        actorUserId: ADMIN_ID,
        useDraft: true,
        draftConfig: {
          provider: "openai",
          model: "gpt-4o",
          baseURL: "https://api.openai.com/v1",
          apiKeySource: "env",
          apiKeyCiphertext: null,
        },
      },
    });
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();

    expect(stub.calls).toHaveLength(1);
    const captured = stub.calls[0];
    expect(captured?.cfg.provider).toBe("openai");
    expect(captured?.cfg.model).toBe("gpt-4o");
    expect(captured?.cfg.baseURL).toBe("https://api.openai.com/v1");
    expect(captured?.apiKey).toBe("sk-env");
  });

  it("useDraft=true with draftConfig=null returns ok=false with an explanatory error (no tester dispatch)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    const stub = new StubLLMConnectionTester({ ok: true, latencyMs: 0 });
    const container = {
      ...baseContainer,
      adminSettingsEnv: {
        apiKey: "sk-env",
        provider: null,
        model: null,
        baseURL: null,
      },
      llmConnectionTester: stub,
    };

    const result = await testLLMConnection({
      container,
      input: { actorUserId: ADMIN_ID, useDraft: true, draftConfig: null },
    });
    expect(result).toEqual({
      ok: false,
      latencyMs: 0,
      error: "Draft configuration is required when useDraft is true",
    });
    expect(stub.calls).toHaveLength(0);
  });

  // Regression for ADR-002 (#432): a whitespace-only env apiKey counts as
  // "present" via `length > 0` (not trimmed), so env wins over the persisted
  // db key and the usecase does NOT fall back to decrypting the ciphertext.
  // The resolved key is then caught by the effective-empty guard. Before the
  // fix (`trim().length > 0`) env was treated as unset and the db key pinged
  // ok=true, so this test fails on the old behavior.
  it("whitespace-only env apiKey wins over the db key and does not fall back (ADR-002, #432)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    // Persist a valid db api key (no env override during the write).
    await updateLLMConfig({
      container: baseContainer,
      input: {
        actorUserId: ADMIN_ID,
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        baseURL: null,
        apiKeyPlain: "sk-db-secret",
      },
    });

    const stub = new StubLLMConnectionTester({ ok: true, latencyMs: 5 });
    const container = {
      ...baseContainer,
      adminSettingsEnv: {
        apiKey: "   ",
        provider: null,
        model: null,
        baseURL: null,
      },
      llmConnectionTester: stub,
    };

    const result = await testLLMConnection({
      container,
      input: { actorUserId: ADMIN_ID, useDraft: false, draftConfig: null },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      "No api key available for the configured LLM provider",
    );
    expect(stub.calls).toHaveLength(0);
  });
});

// ---------- UpdateSpeechConfig ----------

describe("updateSpeechConfig", () => {
  it("admin storing a new api key encrypts it and persists apiKeySource='db'", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    await updateSpeechConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "openai",
        model: "gpt-4o-transcribe",
        apiKeyPlain: "sk-speech-secret",
      },
    });

    const rows = await container.db.select().from(schema.instanceSettings);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.speechProvider).toBe("openai");
    expect(rows[0]?.speechModel).toBe("gpt-4o-transcribe");
    expect(rows[0]?.speechApiKeySource).toBe("db");
    expect(rows[0]?.speechApiKeyCiphertext).not.toBeNull();
    expect(rows[0]?.speechApiKeyCiphertext).not.toBe("sk-speech-secret");
  });

  it("forces apiKeySource='env' when adminSpeechEnv.apiKey is configured (silent-skip the freshly-encrypted ciphertext)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    const container = {
      ...baseContainer,
      adminSpeechEnv: { apiKey: "sk-from-env", provider: null, model: null },
    };

    await updateSpeechConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "openai",
        model: "gpt-4o-transcribe",
        apiKeyPlain: "sk-ignored",
      },
    });

    const rows = await baseContainer.db.select().from(schema.instanceSettings);
    expect(rows[0]?.speechApiKeySource).toBe("env");
    expect(rows[0]?.speechApiKeyCiphertext).toBeNull();
  });

  it("logger.warn is invoked with { fields } when provider/model are env-pinned (silent-skip)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    // Seed a db-sourced config first so the later env-pinned write preserves it.
    await updateSpeechConfig({
      container: baseContainer,
      input: {
        actorUserId: ADMIN_ID,
        provider: "openai",
        model: "gpt-4o-transcribe",
        apiKeyPlain: "sk-speech-original",
      },
    });
    const before = await baseContainer.db
      .select()
      .from(schema.instanceSettings);
    const beforeCiphertext = before[0]?.speechApiKeyCiphertext;

    const warnSpy = vi.fn();
    const container = {
      ...baseContainer,
      logger: { info: () => {}, warn: warnSpy, error: () => {} },
      adminSpeechEnv: {
        apiKey: null,
        provider: "openai",
        model: "whisper-1",
      },
    };
    await updateSpeechConfig({
      container,
      input: {
        actorUserId: ADMIN_ID,
        provider: "openai",
        model: "gpt-4o-transcribe",
        apiKeyPlain: null,
      },
    });

    expect(warnSpy).toHaveBeenCalledWith("admin_speech_env_override_skip", {
      fields: ["provider", "model"],
    });
    // env-pinned provider/model leave the persisted model untouched.
    const after = await baseContainer.db.select().from(schema.instanceSettings);
    expect(after[0]?.speechModel).toBe("gpt-4o-transcribe");
    expect(after[0]?.speechApiKeyCiphertext).toBe(beforeCiphertext);
  });

  it("member is rejected with ForbiddenError", async () => {
    await seedUser({
      id: MEMBER_ID,
      username: "bob",
      email: "bob@example.com",
      role: "member",
    });
    const container = createTestContainer();
    let caught: unknown;
    try {
      await updateSpeechConfig({
        container,
        input: {
          actorUserId: MEMBER_ID,
          provider: "openai",
          model: "gpt-4o-transcribe",
          apiKeyPlain: "sk-speech",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isForbiddenError(caught)).toBe(true);
  });

  it("rejects an empty model string with BusinessRuleError", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    let caught: unknown;
    try {
      await updateSpeechConfig({
        container,
        input: {
          actorUserId: ADMIN_ID,
          provider: "openai",
          model: "   ",
          apiKeyPlain: "sk-speech",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isBusinessRuleError(caught)).toBe(true);
  });
});

// ---------- TestSpeechConnection ----------

describe("testSpeechConnection", () => {
  it("returns ok=true with latencyMs >= 0 on a successful probe (env apiKey)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    const container = {
      ...baseContainer,
      adminSpeechEnv: { apiKey: "sk-env", provider: null, model: null },
      speechConnectionTester: new StubSpeechConnectionTester({
        ok: true,
        latencyMs: 42,
      }),
    };

    const result = await testSpeechConnection({
      container,
      input: { actorUserId: ADMIN_ID, useDraft: false, draftConfig: null },
    });
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBe(42);
    expect(result.error).toBeNull();
  });

  it("returns ok=false with an error message when the probe reports failure", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    const container = {
      ...baseContainer,
      adminSpeechEnv: { apiKey: "sk-env", provider: null, model: null },
      speechConnectionTester: new StubSpeechConnectionTester({
        ok: false,
        latencyMs: 12,
        error: "invalid_request_error: no such model",
      }),
    };

    const result = await testSpeechConnection({
      container,
      input: { actorUserId: ADMIN_ID, useDraft: false, draftConfig: null },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_request_error: no such model");
  });

  it("useDraft=true forwards the draftConfig to the probe and resolves the env apiKey (env > db)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    const stub = new StubSpeechConnectionTester({ ok: true, latencyMs: 7 });
    const container = {
      ...baseContainer,
      adminSpeechEnv: { apiKey: "sk-env", provider: null, model: null },
      speechConnectionTester: stub,
    };

    const result = await testSpeechConnection({
      container,
      input: {
        actorUserId: ADMIN_ID,
        useDraft: true,
        draftConfig: {
          provider: "openai",
          model: "gpt-4o-transcribe",
          apiKeySource: "env",
          apiKeyCiphertext: null,
        },
      },
    });
    expect(result.ok).toBe(true);

    expect(stub.calls).toHaveLength(1);
    const captured = stub.calls[0];
    expect(captured?.cfg.provider).toBe("openai");
    expect(captured?.cfg.model).toBe("gpt-4o-transcribe");
    // env apiKey wins over the (absent) draft db key.
    expect(captured?.apiKey).toBe("sk-env");
  });

  it("useDraft=true with draftConfig=null returns ok=false with an explanatory error (no probe dispatch)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    const stub = new StubSpeechConnectionTester({ ok: true, latencyMs: 0 });
    const container = {
      ...baseContainer,
      adminSpeechEnv: { apiKey: "sk-env", provider: null, model: null },
      speechConnectionTester: stub,
    };

    const result = await testSpeechConnection({
      container,
      input: { actorUserId: ADMIN_ID, useDraft: true, draftConfig: null },
    });
    expect(result).toEqual({
      ok: false,
      latencyMs: 0,
      error: "Draft configuration is required when useDraft is true",
    });
    expect(stub.calls).toHaveLength(0);
  });

  it("returns ok=false without dispatching when no api key is available (env unset, persisted source=env)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    const stub = new StubSpeechConnectionTester({ ok: true, latencyMs: 5 });
    // Default persisted config (no row yet) is env-sourced; with env apiKey
    // unset there is no key to resolve.
    const container = {
      ...baseContainer,
      adminSpeechEnv: { apiKey: null, provider: null, model: null },
      speechConnectionTester: stub,
    };

    const result = await testSpeechConnection({
      container,
      input: { actorUserId: ADMIN_ID, useDraft: false, draftConfig: null },
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(
      "No api key available for the configured speech provider",
    );
    expect(stub.calls).toHaveLength(0);
  });

  it("decrypts the persisted db api key and pings when env apiKey is unset", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    // Persist a db-sourced speech api key (no env override during the write).
    await updateSpeechConfig({
      container: baseContainer,
      input: {
        actorUserId: ADMIN_ID,
        provider: "openai",
        model: "gpt-4o-transcribe",
        apiKeyPlain: "sk-db-speech",
      },
    });

    const stub = new StubSpeechConnectionTester({ ok: true, latencyMs: 9 });
    const container = {
      ...baseContainer,
      adminSpeechEnv: { apiKey: null, provider: null, model: null },
      speechConnectionTester: stub,
    };

    const result = await testSpeechConnection({
      container,
      input: { actorUserId: ADMIN_ID, useDraft: false, draftConfig: null },
    });
    expect(result.ok).toBe(true);
    expect(stub.calls).toHaveLength(1);
    // The decrypted db key (not a ciphertext) reaches the probe.
    expect(stub.calls[0]?.apiKey).toBe("sk-db-speech");
  });

  it("member is rejected with ForbiddenError", async () => {
    await seedUser({
      id: MEMBER_ID,
      username: "bob",
      email: "bob@example.com",
      role: "member",
    });
    const baseContainer = createTestContainer();
    const container = {
      ...baseContainer,
      adminSpeechEnv: { apiKey: "sk-env", provider: null, model: null },
      speechConnectionTester: new StubSpeechConnectionTester({
        ok: true,
        latencyMs: 1,
      }),
    };
    let caught: unknown;
    try {
      await testSpeechConnection({
        container,
        input: { actorUserId: MEMBER_ID, useDraft: false, draftConfig: null },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isForbiddenError(caught)).toBe(true);
  });
});

// ---------- UpdatePromptTemplate ----------

describe("updatePromptTemplate", () => {
  it("admin updates a prompt whose expectedVariables match the placeholders", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    await updatePromptTemplate({
      container,
      input: {
        actorUserId: ADMIN_ID,
        purpose: "title",
        template: {
          text: "Title: {{ name }}",
          expectedVariables: ["name"],
        },
      },
    });

    const rows = await container.db.select().from(schema.instanceSettings);
    expect(rows).toHaveLength(1);
    const promptsJson = JSON.parse(rows[0]?.promptsJson ?? "{}") as Record<
      string,
      { text: string; expectedVariables: string[] }
    >;
    expect(promptsJson.title?.text).toBe("Title: {{ name }}");
  });

  it("rejects a template referencing a missing expected variable (prompt_variable_missing)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    let caught: unknown;
    try {
      await updatePromptTemplate({
        container,
        input: {
          actorUserId: ADMIN_ID,
          purpose: "title",
          template: {
            text: "Title: {{ name }} {{ extra }}",
            expectedVariables: ["name"],
          },
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isBusinessRuleError(caught)).toBe(true);
  });

  it("rejects a template whose text exceeds 16 KiB (prompt_too_large)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    let caught: unknown;
    try {
      await updatePromptTemplate({
        container,
        input: {
          actorUserId: ADMIN_ID,
          purpose: "title",
          template: {
            text: "a".repeat(16 * 1024 + 1),
            expectedVariables: [],
          },
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isBusinessRuleError(caught)).toBe(true);
  });

  it("re-saving the same prompt content does not bump version (Issue #261)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    const payload = {
      actorUserId: ADMIN_ID,
      purpose: "title",
      template: { text: "custom title", expectedVariables: [] },
    } as const;
    await updatePromptTemplate({ container, input: payload });
    const rowsAfterFirst = await container.db
      .select()
      .from(schema.instanceSettings);
    expect(rowsAfterFirst).toHaveLength(1);
    const versionAfterFirst = rowsAfterFirst[0]?.version;
    expect(typeof versionAfterFirst).toBe("number");

    await updatePromptTemplate({ container, input: payload });
    const rowsAfterSecond = await container.db
      .select()
      .from(schema.instanceSettings);
    expect(rowsAfterSecond).toHaveLength(1);
    expect(rowsAfterSecond[0]?.version).toBe(versionAfterFirst);
  });
});

// ---------- ResetPromptTemplate / ResetAllPromptTemplates (Issue #218) ----------

describe("resetPromptTemplate", () => {
  it("removes a single override so the purpose falls back to default", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    await updatePromptTemplate({
      container,
      input: {
        actorUserId: ADMIN_ID,
        purpose: "title",
        template: { text: "custom title", expectedVariables: [] },
      },
    });

    await resetPromptTemplate({
      container,
      input: { actorUserId: ADMIN_ID, purpose: "title" },
    });

    const rows = await container.db.select().from(schema.instanceSettings);
    const promptsJson = JSON.parse(rows[0]?.promptsJson ?? "{}") as Record<
      string,
      { text: string }
    >;
    expect(promptsJson.title).toBeUndefined();
  });

  it("is a no-op when the override does not exist (no DB write)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    await resetPromptTemplate({
      container,
      input: { actorUserId: ADMIN_ID, purpose: "title" },
    });
    // No-op should not bootstrap the singleton row.
    const rows = await container.db.select().from(schema.instanceSettings);
    expect(rows).toHaveLength(0);
  });

  it("member is rejected with ForbiddenError", async () => {
    await seedUser({
      id: MEMBER_ID,
      username: "bob",
      email: "bob@example.com",
      role: "member",
    });
    const container = createTestContainer();
    let caught: unknown;
    try {
      await resetPromptTemplate({
        container,
        input: { actorUserId: MEMBER_ID, purpose: "title" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isForbiddenError(caught)).toBe(true);
  });
});

describe("resetAllPromptTemplates", () => {
  it("clears every override at once", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    await updatePromptTemplate({
      container,
      input: {
        actorUserId: ADMIN_ID,
        purpose: "title",
        template: { text: "custom title", expectedVariables: [] },
      },
    });
    await updatePromptTemplate({
      container,
      input: {
        actorUserId: ADMIN_ID,
        purpose: "structure",
        template: { text: "custom structure", expectedVariables: [] },
      },
    });

    await resetAllPromptTemplates({
      container,
      input: { actorUserId: ADMIN_ID },
    });

    const rows = await container.db.select().from(schema.instanceSettings);
    const promptsJson = JSON.parse(rows[0]?.promptsJson ?? "{}") as Record<
      string,
      unknown
    >;
    expect(Object.keys(promptsJson)).toHaveLength(0);
  });

  it("is a no-op when no overrides exist (no DB write)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    await resetAllPromptTemplates({
      container,
      input: { actorUserId: ADMIN_ID },
    });
    const rows = await container.db.select().from(schema.instanceSettings);
    expect(rows).toHaveLength(0);
  });

  it("member is rejected with ForbiddenError", async () => {
    await seedUser({
      id: MEMBER_ID,
      username: "bob",
      email: "bob@example.com",
      role: "member",
    });
    const container = createTestContainer();
    let caught: unknown;
    try {
      await resetAllPromptTemplates({
        container,
        input: { actorUserId: MEMBER_ID },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isForbiddenError(caught)).toBe(true);
  });
});

describe("updatePromptTemplate empty-text routing (ADR-006)", () => {
  it("routes empty text to reset (= remove the override)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    await updatePromptTemplate({
      container,
      input: {
        actorUserId: ADMIN_ID,
        purpose: "title",
        template: { text: "custom title", expectedVariables: [] },
      },
    });
    await updatePromptTemplate({
      container,
      input: {
        actorUserId: ADMIN_ID,
        purpose: "title",
        template: { text: "", expectedVariables: [] },
      },
    });

    const rows = await container.db.select().from(schema.instanceSettings);
    const promptsJson = JSON.parse(rows[0]?.promptsJson ?? "{}") as Record<
      string,
      unknown
    >;
    expect(promptsJson.title).toBeUndefined();
  });
});

// ---------- UpdateUserPromptOverride ----------

describe("updateUserPromptOverride", () => {
  it("upserts an override for the actor", async () => {
    await seedUser({
      id: MEMBER_ID,
      username: "bob",
      email: "bob@example.com",
      role: "member",
    });
    const container = createTestContainer();
    await updateUserPromptOverride({
      container,
      input: {
        actorUserId: MEMBER_ID,
        purpose: "title",
        template: { text: "custom", expectedVariables: [] },
      },
    });

    const rows = await container.db.select().from(schema.userPromptOverrides);
    expect(rows).toHaveLength(1);
    const promptsJson = JSON.parse(rows[0]?.promptsJson ?? "{}") as Record<
      string,
      { text: string }
    >;
    expect(promptsJson.title?.text).toBe("custom");
  });

  it("clearPrompt(null) on the last remaining override deletes the row", async () => {
    await seedUser({
      id: MEMBER_ID,
      username: "bob",
      email: "bob@example.com",
      role: "member",
    });
    const container = createTestContainer();
    await updateUserPromptOverride({
      container,
      input: {
        actorUserId: MEMBER_ID,
        purpose: "title",
        template: { text: "custom", expectedVariables: [] },
      },
    });
    await updateUserPromptOverride({
      container,
      input: {
        actorUserId: MEMBER_ID,
        purpose: "title",
        template: null,
      },
    });

    const rows = await container.db.select().from(schema.userPromptOverrides);
    expect(rows).toHaveLength(0);
  });

  it("rejects an invalid template", async () => {
    await seedUser({
      id: MEMBER_ID,
      username: "bob",
      email: "bob@example.com",
      role: "member",
    });
    const container = createTestContainer();
    let caught: unknown;
    try {
      await updateUserPromptOverride({
        container,
        input: {
          actorUserId: MEMBER_ID,
          purpose: "title",
          template: {
            text: "{{ unknown }}",
            expectedVariables: [],
          },
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isBusinessRuleError(caught)).toBe(true);
  });
});

// ---------- UpdateDesignTokens / ResetDesignTokens ----------

describe("updateDesignTokens / resetDesignTokens", () => {
  it("admin persists a canonical tokens map", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    await updateDesignTokens({
      container,
      input: {
        actorUserId: ADMIN_ID,
        tokens: { "--color-primary": "#abc" },
      },
    });
    const rows = await container.db.select().from(schema.instanceSettings);
    const stored = JSON.parse(rows[0]?.designTokensJson ?? '{"tokens":{}}') as {
      tokens: Record<string, string>;
    };
    expect(stored.tokens["--color-primary"]).toBe("#abc");
  });

  it("rejects a non-canonical key with BusinessRuleError", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    let caught: unknown;
    try {
      await updateDesignTokens({
        container,
        input: {
          actorUserId: ADMIN_ID,
          tokens: { "--FOO": "red" },
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isBusinessRuleError(caught)).toBe(true);
  });

  it("re-saving identical tokens does not bump version (Issue #261)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    const payload = {
      actorUserId: ADMIN_ID,
      tokens: { "--color-primary": "#abc", "--color-bg": "#fff" },
    } as const;
    await updateDesignTokens({ container, input: payload });
    const rowsAfterFirst = await container.db
      .select()
      .from(schema.instanceSettings);
    expect(rowsAfterFirst).toHaveLength(1);
    const versionAfterFirst = rowsAfterFirst[0]?.version;
    expect(typeof versionAfterFirst).toBe("number");

    await updateDesignTokens({ container, input: payload });
    const rowsAfterSecond = await container.db
      .select()
      .from(schema.instanceSettings);
    expect(rowsAfterSecond).toHaveLength(1);
    expect(rowsAfterSecond[0]?.version).toBe(versionAfterFirst);
  });

  it("resetDesignTokens restores the empty default map", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    await updateDesignTokens({
      container,
      input: {
        actorUserId: ADMIN_ID,
        tokens: { "--color-primary": "#abc" },
      },
    });
    await resetDesignTokens({
      container,
      input: { actorUserId: ADMIN_ID },
    });
    const rows = await container.db.select().from(schema.instanceSettings);
    const stored = JSON.parse(rows[0]?.designTokensJson ?? '{"tokens":{}}') as {
      tokens: Record<string, string>;
    };
    expect(Object.keys(stored.tokens)).toHaveLength(0);
  });

  it("drops entries equal to the built-in default, persists only deviations (Issue #397)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    await updateDesignTokens({
      container,
      input: {
        actorUserId: ADMIN_ID,
        tokens: {
          // Equal to the built-in default — must be dropped.
          "--color-accent": "oklch(37.1% 0 0)",
          // Differs from the default — must be persisted.
          "--color-bg": "#000000",
          // Outside the curated set — must be persisted.
          "--color-primary": "#abc",
        },
      },
    });
    const rows = await container.db.select().from(schema.instanceSettings);
    const stored = JSON.parse(rows[0]?.designTokensJson ?? '{"tokens":{}}') as {
      tokens: Record<string, string>;
    };
    expect(stored.tokens["--color-accent"]).toBeUndefined();
    expect(stored.tokens["--color-bg"]).toBe("#000000");
    expect(stored.tokens["--color-primary"]).toBe("#abc");
  });

  it("removes an existing override when the key is re-sent at its default value (Issue #397)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    const defaultValue = BUILTIN_DESIGN_TOKENS["--color-accent"];
    expect(defaultValue).toBeDefined();

    // (1) Persist a deviation from the built-in default.
    await updateDesignTokens({
      container,
      input: {
        actorUserId: ADMIN_ID,
        tokens: {
          "--color-accent": "#deviated",
          "--color-bg": "#000000",
        },
      },
    });
    const afterOverride = await container.db
      .select()
      .from(schema.instanceSettings);
    const stored1 = JSON.parse(
      afterOverride[0]?.designTokensJson ?? '{"tokens":{}}',
    ) as { tokens: Record<string, string> };
    expect(stored1.tokens["--color-accent"]).toBe("#deviated");

    // (2) Re-send the same key at its built-in default value.
    await updateDesignTokens({
      container,
      input: {
        actorUserId: ADMIN_ID,
        tokens: {
          "--color-accent": defaultValue as string,
          "--color-bg": "#000000",
        },
      },
    });

    // (3) The override is gone; only the still-deviating key remains.
    const afterReset = await container.db
      .select()
      .from(schema.instanceSettings);
    const stored2 = JSON.parse(
      afterReset[0]?.designTokensJson ?? '{"tokens":{}}',
    ) as { tokens: Record<string, string> };
    expect(stored2.tokens["--color-accent"]).toBeUndefined();
    expect(stored2.tokens["--color-bg"]).toBe("#000000");
  });

  it("getInstanceSettings surfaces built-in defaults and override flags (Issue #397)", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();

    // No overrides yet: every curated default is surfaced with
    // `isOverridden: false`.
    const before = await getInstanceSettings({
      container,
      input: { actorUserId: ADMIN_ID },
    });
    expect(before.settings.designTokens["--color-accent"]).toEqual({
      value: "oklch(37.1% 0 0)",
      isOverridden: false,
    });
    expect(before.settings.designTokenDefaults["--color-accent"]).toBe(
      "oklch(37.1% 0 0)",
    );

    // Every curated default key/value surfaces, and with no overrides the DTO
    // contains exactly the curated set (no extra keys).
    const builtinKeys = Object.keys(BUILTIN_DESIGN_TOKENS);
    expect(Object.keys(before.settings.designTokens).sort()).toEqual(
      [...builtinKeys].sort(),
    );
    for (const [key, value] of Object.entries(BUILTIN_DESIGN_TOKENS)) {
      expect(before.settings.designTokens[key]).toEqual({
        value,
        isOverridden: false,
      });
    }

    await updateDesignTokens({
      container,
      input: {
        actorUserId: ADMIN_ID,
        tokens: { "--color-bg": "#000000", "--color-primary": "#abc" },
      },
    });

    const after = await getInstanceSettings({
      container,
      input: { actorUserId: ADMIN_ID },
    });
    // Overridden curated key.
    expect(after.settings.designTokens["--color-bg"]).toEqual({
      value: "#000000",
      isOverridden: true,
    });
    // Untouched curated key still reflects the default.
    expect(after.settings.designTokens["--color-accent"]).toEqual({
      value: "oklch(37.1% 0 0)",
      isOverridden: false,
    });
    // Ad-hoc override key outside the curated set is surfaced too.
    expect(after.settings.designTokens["--color-primary"]).toEqual({
      value: "#abc",
      isOverridden: true,
    });
  });
});

// ---------- ToggleRegistrationPolicy / UpdateInstanceLimits ----------

describe("toggleRegistrationPolicy", () => {
  it("closing registration causes signUp to fail with `registration_closed`", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    await toggleRegistrationPolicy({
      container,
      input: {
        actorUserId: ADMIN_ID,
        open: false,
        closedReason: "maintenance",
      },
    });

    let caught: unknown;
    try {
      await signUp({
        container,
        input: {
          username: "newbie",
          email: "newbie@example.com",
          password: "correct-horse-battery-staple-9!",
          displayName: null,
          acceptTerms: true,
        },
      });
      expect.fail("signUp should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isBusinessRuleError(caught)).toBe(true);
    if (isBusinessRuleError(caught)) {
      expect(caught.code).toBe("registration_closed");
    }
  });

  it("re-opening registration lets signUp succeed", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    // Persist a closed-then-open round trip so we exercise both transitions.
    await toggleRegistrationPolicy({
      container,
      input: {
        actorUserId: ADMIN_ID,
        open: false,
        closedReason: "maintenance",
      },
    });
    await toggleRegistrationPolicy({
      container,
      input: { actorUserId: ADMIN_ID, open: true, closedReason: null },
    });

    const { userId } = await signUp({
      container,
      input: {
        username: "newbie",
        email: "newbie@example.com",
        password: "correct-horse-battery-staple-9!",
        displayName: null,
        acceptTerms: true,
      },
    });
    expect(typeof userId).toBe("string");

    const rows = await container.db.select().from(schema.instanceSettings);
    expect(rows[0]?.registrationOpen).toBe(1);
    expect(rows[0]?.registrationClosedReason).toBeNull();
  });
});

describe("updateInstanceLimits", () => {
  it("rejects a negative limit value", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();
    let caught: unknown;
    try {
      await updateInstanceLimits({
        container,
        input: {
          actorUserId: ADMIN_ID,
          limits: {
            maxUploadBytesPerDay: -1,
            maxIngestionBytes: 1,
            maxNoteBytes: 1,
            maxExportArtifactBytes: 1,
            maxShareLinksPerNote: 1,
            editLockTtlSec: 1,
            trashRetentionDays: 1,
            maxNoteRevisionsPerNote: 1,
          },
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isBusinessRuleError(caught)).toBe(true);
  });
});

// ---------- GetUsageMetrics ----------

describe("getUsageMetrics", () => {
  it("returns the snapshot verbatim when all metrics are present", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    const container = {
      ...baseContainer,
      usageMetricsProvider: new StubUsageMetricsProvider({
        userCount: 12,
        storageDurableObjectBytes: 100,
        storageR2Bytes: 200,
        uploadsToday: 3,
        llmCallsToday: 4,
        uploadsHourly: null,
        alerts: [{ code: "ok", message: "all green", severity: "info" }],
      }),
    };
    const result = await getUsageMetrics({
      container,
      input: { actorUserId: ADMIN_ID },
    });
    expect(result.userCount).toBe(12);
    expect(result.storageDurableObjectBytes).toBe(100);
    expect(result.uploadsToday).toBe(3);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.severity).toBe("info");
  });

  it("surfaces null for metrics that the provider could not collect", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const baseContainer = createTestContainer();
    const container = {
      ...baseContainer,
      usageMetricsProvider: new StubUsageMetricsProvider({
        userCount: 12,
        storageDurableObjectBytes: null,
        storageR2Bytes: null,
        uploadsToday: 3,
        llmCallsToday: null,
        uploadsHourly: null,
        alerts: [
          {
            code: "do_unavailable",
            message: "DO size endpoint returned 503",
            severity: "warning",
          },
        ],
      }),
    };
    const result = await getUsageMetrics({
      container,
      input: { actorUserId: ADMIN_ID },
    });
    expect(result.userCount).toBe(12);
    expect(result.storageDurableObjectBytes).toBeNull();
    expect(result.storageR2Bytes).toBeNull();
    expect(result.llmCallsToday).toBeNull();
    expect(result.uploadsToday).toBe(3);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.severity).toBe("warning");
  });

  // Tighten the assertion that `getUsageMetrics` itself enforces admin only.
  it("member is rejected with ForbiddenError before the metrics provider is invoked", async () => {
    await seedUser({
      id: MEMBER_ID,
      username: "bob",
      email: "bob@example.com",
      role: "member",
    });
    let collected = false;
    const baseContainer = createTestContainer();
    const container = {
      ...baseContainer,
      usageMetricsProvider: {
        async collect(): Promise<UsageMetricsSnapshot> {
          collected = true;
          return {
            userCount: 0,
            storageDurableObjectBytes: null,
            storageR2Bytes: null,
            uploadsToday: null,
            llmCallsToday: null,
            uploadsHourly: null,
            alerts: [],
          };
        },
      },
    };
    let caught: unknown;
    try {
      await getUsageMetrics({
        container,
        input: { actorUserId: MEMBER_ID },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isForbiddenError(caught)).toBe(true);
    expect(collected).toBe(false);
  });
});

// ---------- Settings persistence sanity ----------

describe("InstanceSettings persistence round-trip", () => {
  it("calling getInstanceSettings after multiple writes reflects the latest state", async () => {
    await seedUser({
      id: ADMIN_ID,
      username: "alice",
      email: "alice@example.com",
      role: "admin",
    });
    const container = createTestContainer();

    await updateDesignTokens({
      container,
      input: {
        actorUserId: ADMIN_ID,
        tokens: { "--accent": "#111111" },
      },
    });
    await toggleRegistrationPolicy({
      container,
      input: { actorUserId: ADMIN_ID, open: false, closedReason: "soon" },
    });

    const { settings } = await getInstanceSettings({
      container,
      input: { actorUserId: ADMIN_ID },
    });
    // `--accent` is outside the curated default subset, so it is surfaced as
    // an ad-hoc override (`isOverridden: true`) rather than as a string value.
    expect(settings.designTokens["--accent"]?.value).toBe("#111111");
    expect(settings.designTokens["--accent"]?.isOverridden).toBe(true);
    expect(settings.registration.open).toBe(false);
    expect(settings.registration.closedReason).toBe("soon");

    // Domain-side reconstruction also succeeds (no schema drift).
    const rows = await container.db.select().from(schema.instanceSettings);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (!row) throw new Error("settings row missing");
    const designTokensStored = JSON.parse(row.designTokensJson) as {
      tokens: Record<string, string>;
    };
    const rehydrated = InstanceSettings.reconstruct({
      llm: {
        provider: row.llmProvider,
        model: row.llmModel,
        apiKeySource: row.llmApiKeySource,
        apiKeyCiphertext: row.llmApiKeyCiphertext,
      },
      prompts: JSON.parse(row.promptsJson),
      designTokens: designTokensStored,
      registration: {
        open: row.registrationOpen === 1,
        closedReason: row.registrationClosedReason,
      },
      limits: JSON.parse(row.limitsJson),
      version: row.version,
      updatedAt: new Date(row.updatedAt),
    });
    expect(rehydrated.registration.open).toBe(false);
  });
});
