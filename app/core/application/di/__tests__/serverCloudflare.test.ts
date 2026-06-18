import type { D1Database, Fetcher, R2Bucket } from "@cloudflare/workers-types";
import { describe, expect, it, vi } from "vitest";
import { content } from "@/config";
import { AnthropicLLMProvider } from "@/core/adapters/anthropic/llmProvider";
import { AnthropicOCRProvider } from "@/core/adapters/anthropic/ocrProvider";
import { AnthropicPDFExtractor } from "@/core/adapters/anthropic/pdfExtractor";
import { R2ObjectStorage } from "@/core/adapters/cloudflare/r2ObjectStorage";
import { R2TempFileStorage } from "@/core/adapters/cloudflare/r2TempFileStorage";
import { ServiceBindingRelayTrigger } from "@/core/adapters/cloudflare/serviceBindingRelayTrigger";
import { StubLLMProvider } from "@/core/adapters/stub/llmProvider";
import { StubOCRProvider } from "@/core/adapters/stub/ocrProvider";
import { StubPDFExtractor } from "@/core/adapters/stub/pdfExtractor";
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_ATTEMPTS,
} from "@/core/application/workers/eventRelayWorker";
import { DEFAULT_OUTBOX_RETENTION_MS } from "@/core/application/workers/outboxPrune";
import {
  SecretBoxError,
  SecretBoxErrorCode,
} from "@/core/domain/adminSettings/ports/secretBox";
import { BusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import {
  type TempFileStorage,
  TempFileStorageUnavailableError,
} from "@/core/domain/ingestion/ports/tempFileStorage";
import {
  type ObjectStorage,
  StorageUnavailableError,
} from "@/core/domain/media/ports/objectStorage";
import { ConsoleLogger } from "../../ports/logger";
import { NoopRelayTrigger } from "../../ports/relayTrigger";
import {
  buildLlmProvider,
  buildOcrProvider,
  buildPdfExtractor,
  buildRelayTrigger,
  createConsumerContainer,
  createRequestContainer,
  type RequestServerConfig,
  readPruneTuning,
  readRelayTuning,
  readRequestServerConfig,
  type ServerEnv,
} from "../serverCloudflare";

// Tuning readers sit at the wrangler-vars transport boundary. The
// production path supplies validated values from `[env.relay.vars]` /
// `[env.pruner.vars]`; tests and local dev rely on the defaults
// exported by the application-layer worker modules.

function envWith(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    DB: {} as ServerEnv["DB"],
    APP_URL: "http://localhost:8787",
    ...overrides,
  };
}

describe("readRelayTuning", () => {
  it("falls back to application-layer defaults when no env vars are set", () => {
    const tuning = readRelayTuning(envWith());
    expect(tuning).toEqual({
      batchSize: DEFAULT_BATCH_SIZE,
      leaseMs: DEFAULT_LEASE_MS,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    });
  });

  it("coerces string vars from wrangler [vars] to numbers", () => {
    const tuning = readRelayTuning(
      envWith({
        OUTBOX_BATCH_SIZE: "50",
        OUTBOX_LEASE_MS: "120000",
        OUTBOX_MAX_ATTEMPTS: "5",
      }),
    );
    expect(tuning).toEqual({
      batchSize: 50,
      leaseMs: 120_000,
      maxAttempts: 5,
    });
  });

  it("rejects non-positive batch size", () => {
    expect(() =>
      readRelayTuning(envWith({ OUTBOX_BATCH_SIZE: "0" })),
    ).toThrow();
    expect(() =>
      readRelayTuning(envWith({ OUTBOX_BATCH_SIZE: "-1" })),
    ).toThrow();
  });

  it("rejects non-positive lease", () => {
    expect(() => readRelayTuning(envWith({ OUTBOX_LEASE_MS: "0" }))).toThrow();
  });

  it("rejects maxAttempts below 1", () => {
    expect(() =>
      readRelayTuning(envWith({ OUTBOX_MAX_ATTEMPTS: "0" })),
    ).toThrow();
  });

  it("rejects non-numeric strings", () => {
    expect(() =>
      readRelayTuning(envWith({ OUTBOX_BATCH_SIZE: "abc" })),
    ).toThrow();
  });

  it("rejects non-integer values", () => {
    expect(() =>
      readRelayTuning(envWith({ OUTBOX_BATCH_SIZE: "10.5" })),
    ).toThrow();
  });
});

describe("readPruneTuning", () => {
  it("falls back to the application-layer default when no env var is set", () => {
    const tuning = readPruneTuning(envWith());
    expect(tuning).toEqual({ retentionMs: DEFAULT_OUTBOX_RETENTION_MS });
  });

  it("coerces the retention var to a number", () => {
    const tuning = readPruneTuning(
      envWith({ OUTBOX_RETENTION_MS: "86400000" }),
    );
    expect(tuning).toEqual({ retentionMs: 86_400_000 });
  });

  it("rejects non-positive retention", () => {
    expect(() =>
      readPruneTuning(envWith({ OUTBOX_RETENTION_MS: "0" })),
    ).toThrow();
  });

  it("rejects non-numeric retention", () => {
    expect(() =>
      readPruneTuning(envWith({ OUTBOX_RETENTION_MS: "forever" })),
    ).toThrow();
  });
});

// Stable test-only AES-256 key (base64 of 32 zero bytes). Matches
// `TEST_SECRET_BOX_KEY` in the application/d1 test harnesses so the
// crypto pathway is exercised end-to-end without coupling to a real
// secret.
const TEST_SECRET_BOX_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

function configWith(
  overrides: Partial<RequestServerConfig> = {},
): RequestServerConfig {
  return {
    ...content,
    appUrl: "http://localhost:8787",
    // `getDatabase(config.binding)` only constructs a drizzle wrapper;
    // its repositories are lazy, so a fake binding suffices for
    // container construction.
    binding: {} as D1Database,
    ...overrides,
  };
}

describe("readRequestServerConfig", () => {
  // Guards the `exactOptionalPropertyTypes`-driven conditional spread in
  // `readRequestServerConfig`. The factory's `default: throw` is a
  // runtime guard; the *config* shape must never carry an explicit
  // `undefined` for `adminLlmProvider` because that value would reach
  // the factory and be reported as `Unsupported LLM provider: undefined`.
  it("omits adminLlmProvider when ADMIN_LLM_PROVIDER env is unset", () => {
    const config = readRequestServerConfig(envWith());
    expect(Object.hasOwn(config, "adminLlmProvider")).toBe(false);
  });

  it("populates adminLlmProvider when ADMIN_LLM_PROVIDER env is set", () => {
    const config = readRequestServerConfig(
      envWith({ ADMIN_LLM_PROVIDER: "anthropic" }),
    );
    expect(config.adminLlmProvider).toBe("anthropic");
  });

  // `R2_S3_ENDPOINT` threads the local dev-proxy endpoint
  // into the presign config; absent (staging / production) the config
  // must not carry an `endpoint` key so the adapter falls back to the
  // account-scoped R2 endpoint.
  const r2Env: Partial<ServerEnv> = {
    OBJECT_STORAGE: {} as R2Bucket,
    R2_ACCOUNT_ID: "acc",
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: "sec",
    R2_OBJECT_BUCKET_NAME: "buck",
  };

  it("threads R2_S3_ENDPOINT into r2PresignConfig.endpoint when set", () => {
    const config = readRequestServerConfig(
      envWith({ ...r2Env, R2_S3_ENDPOINT: "http://localhost:8787/dev/r2" }),
    );
    expect(config.r2PresignConfig?.endpoint).toBe(
      "http://localhost:8787/dev/r2",
    );
  });

  it("omits r2PresignConfig.endpoint when R2_S3_ENDPOINT is unset (default R2 endpoint)", () => {
    const config = readRequestServerConfig(envWith(r2Env));
    expect(config.r2PresignConfig).toBeDefined();
    expect(Object.hasOwn(config.r2PresignConfig as object, "endpoint")).toBe(
      false,
    );
  });

  it("does not flip r2PresignReady on R2_S3_ENDPOINT alone (endpoint is optional)", () => {
    const config = readRequestServerConfig(
      envWith({ R2_S3_ENDPOINT: "http://localhost:8787/dev/r2" }),
    );
    expect(Object.hasOwn(config, "r2PresignConfig")).toBe(false);
  });
});

describe("createRequestContainer", () => {
  it("wires every RequestContainer field with a non-undefined adapter", () => {
    const container = createRequestContainer(configWith());
    for (const [key, value] of Object.entries(container)) {
      expect(value, key).toBeDefined();
    }
  });

  it("falls back to NullSecretBox when SECRET_BOX_MASTER_KEY is unset", async () => {
    const container = createRequestContainer(configWith());
    await expect(container.secretBox.encrypt("payload")).rejects.toSatisfy(
      (e) =>
        e instanceof SecretBoxError &&
        e.code === SecretBoxErrorCode.KeyUnavailable,
    );
  });

  it("wires WebCryptoSecretBox when the master key is supplied and round-trips a payload", async () => {
    const container = createRequestContainer(
      configWith({ secretBoxMasterKey: TEST_SECRET_BOX_KEY }),
    );
    const ciphertext = await container.secretBox.encrypt("hello");
    const plaintext = await container.secretBox.decrypt(ciphertext);
    expect(plaintext).toBe("hello");
  });

  it("threads ADMIN_LLM_API_KEY into adminSettingsEnv.apiKey", () => {
    const withKey = createRequestContainer(
      configWith({ adminLlmApiKey: "sk-test" }),
    );
    expect(withKey.adminSettingsEnv.apiKey).toBe("sk-test");

    const withoutKey = createRequestContainer(configWith());
    expect(withoutKey.adminSettingsEnv.apiKey).toBeNull();
  });

  it("threads all four ADMIN_LLM_* env vars into adminSettingsEnv", () => {
    const container = createRequestContainer(
      configWith({
        adminLlmApiKey: "sk-test",
        adminLlmProvider: "openai",
        adminLlmModel: "gpt-4o",
        adminLlmBaseUrl: "https://api.groq.com/openai/v1",
      }),
    );
    expect(container.adminSettingsEnv).toEqual({
      apiKey: "sk-test",
      provider: "openai",
      model: "gpt-4o",
      baseURL: "https://api.groq.com/openai/v1",
    });
  });

  it("partial env config leaves the missing fields null on adminSettingsEnv", () => {
    const container = createRequestContainer(
      configWith({ adminLlmProvider: "anthropic" }),
    );
    expect(container.adminSettingsEnv).toEqual({
      apiKey: null,
      provider: "anthropic",
      model: null,
      baseURL: null,
    });
  });

  it("empty-string env values are normalised to null on adminSettingsEnv (length > 0 rule)", () => {
    const container = createRequestContainer(
      configWith({
        adminLlmApiKey: "",
        adminLlmProvider: "",
        adminLlmModel: "",
        adminLlmBaseUrl: "",
      }),
    );
    expect(container.adminSettingsEnv).toEqual({
      apiKey: null,
      provider: null,
      model: null,
      baseURL: null,
    });
  });

  it("whitespace-only baseURL bypasses length>0 normalisation (ADR-002: trim しない) (W-T-003)", () => {
    // ADR-002 / Issue #143: env presence is `length > 0`, *not* `trim().length > 0`.
    // A single-space `" "` env var must be treated as "set" and flow through to
    // `adminSettingsEnv.baseURL` verbatim so admin UI and consumer agree on
    // which fields are env-locked.
    const container = createRequestContainer(
      configWith({ adminLlmBaseUrl: " " }),
    );
    expect(container.adminSettingsEnv.baseURL).toBe(" ");
  });

  it("readRequestServerConfig threads ADMIN_LLM_BASE_URL into adminLlmBaseUrl", () => {
    const config = readRequestServerConfig(
      envWith({ ADMIN_LLM_BASE_URL: "https://api.groq.com/openai/v1" }),
    );
    expect(config.adminLlmBaseUrl).toBe("https://api.groq.com/openai/v1");
  });

  it("readRequestServerConfig omits adminLlmBaseUrl when ADMIN_LLM_BASE_URL is unset", () => {
    const config = readRequestServerConfig(envWith());
    expect(Object.hasOwn(config, "adminLlmBaseUrl")).toBe(false);
  });

  it("readRequestServerConfig omits resendApiKey/emailFrom when env vars are unset", () => {
    const config = readRequestServerConfig(envWith());
    expect(Object.hasOwn(config, "resendApiKey")).toBe(false);
    expect(Object.hasOwn(config, "emailFrom")).toBe(false);
  });

  it("readRequestServerConfig threads RESEND_API_KEY / EMAIL_FROM into the config when both are set", () => {
    const config = readRequestServerConfig(
      envWith({
        RESEND_API_KEY: "re_test_key",
        EMAIL_FROM: "noreply@example.com",
      }),
    );
    expect(config.resendApiKey).toBe("re_test_key");
    expect(config.emailFrom).toBe("noreply@example.com");
  });

  it("readRequestServerConfig drops empty-string RESEND_API_KEY / EMAIL_FROM", () => {
    // Truthy spread mirrors the SECRET_BOX_MASTER_KEY pattern: an
    // empty string from wrangler `[vars]` must not survive the
    // transport boundary, otherwise the AND gate in createRequestContainer
    // would receive a `""` and the constructor empty-string guard
    // would be the only safety net.
    const config = readRequestServerConfig(
      envWith({ RESEND_API_KEY: "", EMAIL_FROM: "" }),
    );
    expect(Object.hasOwn(config, "resendApiKey")).toBe(false);
    expect(Object.hasOwn(config, "emailFrom")).toBe(false);
  });

  it("createRequestContainer wires ConsoleEmailSender when neither RESEND_API_KEY nor EMAIL_FROM is set", async () => {
    const container = createRequestContainer(configWith());
    // ConsoleEmailSender swallows everything via logger.info — verify
    // it never throws and that no real network call is attempted.
    await expect(
      container.emailSender.sendVerification(
        "user@example.com" as never,
        new URL("https://app.example.com/verify"),
        "en",
      ),
    ).resolves.toBeUndefined();
  });

  it("createRequestContainer keeps ConsoleEmailSender when only RESEND_API_KEY is set (AND gate)", async () => {
    const container = createRequestContainer(
      configWith({ resendApiKey: "re_test_key" }),
    );
    // No fetch is performed; ConsoleEmailSender resolves without
    // throwing. If the AND gate had failed open, ResendEmailSender
    // would attempt a real fetch and the test would either throw
    // (network in vitest) or be observable via fetch mocking.
    await expect(
      container.emailSender.sendVerification(
        "user@example.com" as never,
        new URL("https://app.example.com/verify"),
        "en",
      ),
    ).resolves.toBeUndefined();
  });

  it("createRequestContainer keeps ConsoleEmailSender when only EMAIL_FROM is set (AND gate)", async () => {
    const container = createRequestContainer(
      configWith({ emailFrom: "noreply@example.com" }),
    );
    await expect(
      container.emailSender.sendVerification(
        "user@example.com" as never,
        new URL("https://app.example.com/verify"),
        "en",
      ),
    ).resolves.toBeUndefined();
  });

  it("createRequestContainer wires ResendEmailSender when both RESEND_API_KEY and EMAIL_FROM are set", async () => {
    const container = createRequestContainer(
      configWith({
        resendApiKey: "re_test_key",
        emailFrom: "noreply@example.com",
      }),
    );
    // ResendEmailSender attempts a real POST. Stub `globalThis.fetch`
    // to verify the path was taken — ConsoleEmailSender would never
    // call `fetch`.
    const stub = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: "abc" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", stub);
    try {
      await container.emailSender.sendVerification(
        "user@example.com" as never,
        new URL("https://app.example.com/verify"),
        "en",
      );
      expect(stub).toHaveBeenCalledTimes(1);
      const calls = stub.mock.calls as unknown as Array<
        [input: string, init?: RequestInit]
      >;
      const firstCall = calls[0];
      if (!firstCall) throw new Error("expected fetch to be called");
      expect(firstCall[0]).toBe("https://api.resend.com/emails");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("surfaces explicit unavailable errors from inline unavailable storage adapters and StubLLMProvider", async () => {
    const container = createRequestContainer(configWith());
    await expect(
      container.objectStorage.put("k", new ArrayBuffer(0), "text/plain"),
    ).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(
      container.tempFileStorage.put("k", new ArrayBuffer(0)),
    ).rejects.toBeInstanceOf(TempFileStorageUnavailableError);
    await expect(
      container.llmProvider.suggestMetadata({ html: "<p/>", prompt: "" }),
    ).rejects.toSatisfy(
      (e) =>
        e instanceof BusinessRuleError &&
        e.code === IngestionErrorCode.UnsupportedFormat,
    );
  });

  it("surfaces explicit BusinessRuleError from existing Stub providers", async () => {
    const container = createRequestContainer(configWith());
    await expect(
      container.ocrProvider.extractText({
        imageBytes: new ArrayBuffer(100),
        mime: "image/png",
      }),
    ).rejects.toSatisfy(
      (e) =>
        e instanceof BusinessRuleError &&
        e.code === IngestionErrorCode.UnsupportedFormat,
    );
    await expect(
      container.speechRecognitionProvider.transcribe({
        audioBytes: new ArrayBuffer(100),
        mime: "audio/wav",
        locale: "en-US",
      }),
    ).rejects.toSatisfy(
      (e) =>
        e instanceof BusinessRuleError &&
        e.code === IngestionErrorCode.UnsupportedFormat,
    );
    await expect(
      container.officeExtractor.extractText({
        bytes: new ArrayBuffer(100),
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
    ).rejects.toSatisfy(
      (e) =>
        e instanceof BusinessRuleError &&
        e.code === IngestionErrorCode.UnsupportedFormat,
    );
    await expect(
      container.pdfExtractor.extract({
        bytes: new ArrayBuffer(100),
      }),
    ).rejects.toSatisfy(
      (e) =>
        e instanceof BusinessRuleError &&
        e.code === IngestionErrorCode.UnsupportedFormat,
    );
  });
});

// Test bindings — minimal objects with the right shape; tests only
// inspect `instanceof` of the adapter built around them, not behavior.
const fakeBucket = (): R2Bucket => ({}) as R2Bucket;
const fakeFetcher = (): Fetcher => ({}) as Fetcher;

// Verifies the inline unavailable `ObjectStorage` adapter that DI
// installs when the R2 binding / SigV4 presign config is incomplete
// (ADR-001 of Issue #100). Every port method must reject with
// `StorageUnavailableError`; instanceof-based checks no longer apply
// because the production Stub class was removed.
async function assertObjectStoragePortUnavailable(
  storage: ObjectStorage,
): Promise<void> {
  await expect(
    storage.put("k", new ArrayBuffer(0), "text/plain"),
  ).rejects.toThrow(StorageUnavailableError);
  await expect(storage.get("k")).rejects.toThrow(StorageUnavailableError);
  await expect(storage.stat("k")).rejects.toThrow(StorageUnavailableError);
  await expect(storage.delete("k")).rejects.toThrow(StorageUnavailableError);
  await expect(storage.presignDownload("k", 60)).rejects.toThrow(
    StorageUnavailableError,
  );
  await expect(storage.presignUpload("k", "text/plain", 60)).rejects.toThrow(
    StorageUnavailableError,
  );
}

// Symmetric counterpart of `assertObjectStoragePortUnavailable` for the
// inline unavailable `TempFileStorage` adapter that DI installs when the
// `TEMP_FILES` R2 binding is absent (ADR-001 of Issue #100). Asserts the
// full port surface — every method — rejects with
// `TempFileStorageUnavailableError`.
async function assertTempFileStoragePortUnavailable(
  storage: TempFileStorage,
): Promise<void> {
  await expect(storage.put("k", new ArrayBuffer(0))).rejects.toThrow(
    TempFileStorageUnavailableError,
  );
  await expect(storage.get("k")).rejects.toThrow(
    TempFileStorageUnavailableError,
  );
  await expect(storage.delete("k")).rejects.toThrow(
    TempFileStorageUnavailableError,
  );
}

describe("createRequestContainer — env → adapter mapping", () => {
  // ----- tempFileStorage --------------------------------------------------
  it("wires R2TempFileStorage when TEMP_FILES binding is present", () => {
    const container = createRequestContainer(
      configWith({ tempFilesBucket: fakeBucket() }),
    );
    expect(container.tempFileStorage).toBeInstanceOf(R2TempFileStorage);
  });

  it("falls back to an unavailable TempFileStorage adapter when TEMP_FILES is absent (every port method rejects with TempFileStorageUnavailableError)", async () => {
    // ADR-001 of Issue #100: the production Stub class was removed and
    // the DI now installs an inline unavailable adapter. Verify the
    // port contract is honoured across every `TempFileStorage` method
    // instead of leaning on `instanceof` of an exported class.
    const container = createRequestContainer(configWith());
    await assertTempFileStoragePortUnavailable(container.tempFileStorage);
  });

  // ----- objectStorage ----------------------------------------------------
  const fullR2Config = {
    objectStorageBucket: fakeBucket(),
    r2PresignConfig: {
      accountId: "acc",
      bucketName: "buck",
      accessKeyId: "key",
      secretAccessKey: "sec",
    },
  } satisfies Partial<RequestServerConfig>;

  it("wires R2ObjectStorage when bucket + presign config are all present", () => {
    const container = createRequestContainer(configWith(fullR2Config));
    expect(container.objectStorage).toBeInstanceOf(R2ObjectStorage);
  });

  it("falls back to an unavailable ObjectStorage adapter when r2PresignConfig is absent (every port method rejects with StorageUnavailableError)", async () => {
    // See note above on TempFileStorage — port contract check replaces
    // the prior `instanceof`-based assertion (Issue #100 ADR-001).
    const container = createRequestContainer(
      configWith({ objectStorageBucket: fakeBucket() }),
    );
    await assertObjectStoragePortUnavailable(container.objectStorage);
  });

  it("falls back to an unavailable ObjectStorage adapter when objectStorageBucket is absent (presign config alone is not enough)", async () => {
    const container = createRequestContainer(
      configWith({ r2PresignConfig: fullR2Config.r2PresignConfig }),
    );
    await assertObjectStoragePortUnavailable(container.objectStorage);
  });

  // ----- llmProvider ------------------------------------------------------
  it("wires AnthropicLLMProvider when both adminLlmApiKey and adminLlmModel are present", () => {
    const container = createRequestContainer(
      configWith({
        adminLlmApiKey: "sk-ant-test",
        adminLlmModel: "claude-3-5-sonnet-latest",
      }),
    );
    expect(container.llmProvider).toBeInstanceOf(AnthropicLLMProvider);
  });

  it("falls back to StubLLMProvider when adminLlmModel is missing", () => {
    const container = createRequestContainer(
      configWith({ adminLlmApiKey: "sk-ant-test" }),
    );
    expect(container.llmProvider).toBeInstanceOf(StubLLMProvider);
  });

  it("falls back to StubLLMProvider when adminLlmApiKey is missing", () => {
    const container = createRequestContainer(
      configWith({ adminLlmModel: "claude-3-5-sonnet-latest" }),
    );
    expect(container.llmProvider).toBeInstanceOf(StubLLMProvider);
  });

  it("falls back to StubLLMProvider when both are missing", () => {
    const container = createRequestContainer(configWith());
    expect(container.llmProvider).toBeInstanceOf(StubLLMProvider);
  });

  // ----- ocrProvider ------------------------------------------------------
  it("wires AnthropicOCRProvider when both adminLlmApiKey and adminLlmModel are present", () => {
    const container = createRequestContainer(
      configWith({
        adminLlmApiKey: "sk-ant-test",
        adminLlmModel: "claude-3-5-sonnet-latest",
      }),
    );
    expect(container.ocrProvider).toBeInstanceOf(AnthropicOCRProvider);
  });

  it("falls back to StubOCRProvider when adminLlmModel is missing", () => {
    const container = createRequestContainer(
      configWith({ adminLlmApiKey: "sk-ant-test" }),
    );
    expect(container.ocrProvider).toBeInstanceOf(StubOCRProvider);
  });

  it("falls back to StubOCRProvider when adminLlmApiKey is missing", () => {
    const container = createRequestContainer(
      configWith({ adminLlmModel: "claude-3-5-sonnet-latest" }),
    );
    expect(container.ocrProvider).toBeInstanceOf(StubOCRProvider);
  });

  it("falls back to StubOCRProvider when both are missing", () => {
    const container = createRequestContainer(configWith());
    expect(container.ocrProvider).toBeInstanceOf(StubOCRProvider);
  });

  // ----- pdfExtractor -----------------------------------------------------
  it("wires AnthropicPDFExtractor when both adminLlmApiKey and adminLlmModel are present", () => {
    const container = createRequestContainer(
      configWith({
        adminLlmApiKey: "sk-ant-test",
        adminLlmModel: "claude-3-5-sonnet-latest",
      }),
    );
    expect(container.pdfExtractor).toBeInstanceOf(AnthropicPDFExtractor);
  });

  it("falls back to StubPDFExtractor when adminLlmModel is missing", () => {
    const container = createRequestContainer(
      configWith({ adminLlmApiKey: "sk-ant-test" }),
    );
    expect(container.pdfExtractor).toBeInstanceOf(StubPDFExtractor);
  });

  it("falls back to StubPDFExtractor when adminLlmApiKey is missing", () => {
    const container = createRequestContainer(
      configWith({ adminLlmModel: "claude-3-5-sonnet-latest" }),
    );
    expect(container.pdfExtractor).toBeInstanceOf(StubPDFExtractor);
  });

  it("falls back to StubPDFExtractor when both are missing", () => {
    const container = createRequestContainer(configWith());
    expect(container.pdfExtractor).toBeInstanceOf(StubPDFExtractor);
  });

  // ----- adminLlmProvider routing ----------------------------------------
  it("threads adminLlmProvider='anthropic' through to all three adapters", () => {
    const container = createRequestContainer(
      configWith({
        adminLlmProvider: "anthropic",
        adminLlmApiKey: "sk-ant-test",
        adminLlmModel: "claude-3-5-sonnet-latest",
      }),
    );
    expect(container.llmProvider).toBeInstanceOf(AnthropicLLMProvider);
    expect(container.ocrProvider).toBeInstanceOf(AnthropicOCRProvider);
    expect(container.pdfExtractor).toBeInstanceOf(AnthropicPDFExtractor);
  });

  it("defaults to anthropic when adminLlmProvider is unset and credentials are present", () => {
    const container = createRequestContainer(
      configWith({
        adminLlmApiKey: "sk-ant-test",
        adminLlmModel: "claude-3-5-sonnet-latest",
      }),
    );
    expect(container.llmProvider).toBeInstanceOf(AnthropicLLMProvider);
    expect(container.ocrProvider).toBeInstanceOf(AnthropicOCRProvider);
    expect(container.pdfExtractor).toBeInstanceOf(AnthropicPDFExtractor);
  });
});

// Helper: build a minimal `ServerEnv` for `createConsumerContainer` tests.
// Repositories under the consumer container are lazy over the D1 binding
// (see `getDatabase`), so a stub binding suffices for instanceof checks.
function envWithBindings(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    DB: {} as D1Database,
    APP_URL: "http://localhost:8787",
    ...overrides,
  };
}

describe("createRequestContainer — relayTrigger wiring", () => {
  // The UoW provider holds the relay trigger as a `private readonly`
  // field; access it through a structural cast so the test can verify
  // wiring without smuggling the trigger out through a side channel.
  function relayTriggerOf(
    container: ReturnType<typeof createRequestContainer>,
  ) {
    return (
      container.unitOfWorkProvider as unknown as {
        readonly relayTrigger: unknown;
      }
    ).relayTrigger;
  }

  it("uses relayTriggerOverride verbatim when provided (skips buildRelayTrigger)", () => {
    // A custom trigger that is neither `ServiceBindingRelayTrigger` nor
    // the `NoopRelayTrigger` singleton — proves the override path takes
    // precedence over both env-derived branches.
    const customKick = vi.fn();
    const customTrigger = { kick: customKick };
    const container = createRequestContainer(
      configWith({
        relay: fakeFetcher(),
        waitUntil: () => undefined,
        relayTriggerOverride: customTrigger,
      }),
    );
    expect(relayTriggerOf(container)).toBe(customTrigger);
  });

  it("falls back to buildRelayTrigger when relayTriggerOverride is unset (production zero-impact regression)", () => {
    const container = createRequestContainer(
      configWith({ relay: fakeFetcher(), waitUntil: () => undefined }),
    );
    expect(relayTriggerOf(container)).toBeInstanceOf(
      ServiceBindingRelayTrigger,
    );
  });

  it("falls back to NoopRelayTrigger when neither override nor relay+waitUntil are provided", () => {
    const container = createRequestContainer(configWith());
    expect(relayTriggerOf(container)).toBe(NoopRelayTrigger);
  });

  it("does not leak relayTriggerOverride into the SSR AppConfig surface", () => {
    // `appConfig` is the destructure remainder fed to SSR head/meta; the
    // override must be stripped so callers can't accidentally read it
    // off the container's `config` field.
    const customTrigger = { kick: () => {} };
    const container = createRequestContainer(
      configWith({ relayTriggerOverride: customTrigger }),
    );
    expect(
      (container.config as unknown as Record<string, unknown>)
        .relayTriggerOverride,
    ).toBeUndefined();
  });
});

describe("buildRelayTrigger", () => {
  // `buildRelayTrigger` is the pure helper that `createRequestContainer`
  // delegates to. Verifying it directly avoids the tautology of
  // re-constructing a `ServiceBindingRelayTrigger` inside the test and
  // asserting `instanceof` against that fresh instance — here the
  // assertion exercises the helper's three-way wiring contract.

  it("returns ServiceBindingRelayTrigger when relay + waitUntil are both present", () => {
    const trigger = buildRelayTrigger(
      fakeFetcher(),
      () => undefined,
      ConsoleLogger,
    );
    expect(trigger).toBeInstanceOf(ServiceBindingRelayTrigger);
  });

  it("returns the NoopRelayTrigger singleton when relay is absent", () => {
    const trigger = buildRelayTrigger(
      undefined,
      () => undefined,
      ConsoleLogger,
    );
    expect(trigger).toBe(NoopRelayTrigger);
  });

  it("returns the NoopRelayTrigger singleton when waitUntil is absent", () => {
    const trigger = buildRelayTrigger(fakeFetcher(), undefined, ConsoleLogger);
    expect(trigger).toBe(NoopRelayTrigger);
  });
});

describe("buildOcrProvider", () => {
  // Direct helper assertion mirrors the `buildRelayTrigger` pattern —
  // verifies the three-way wiring contract without reaching through
  // a container.

  it("returns AnthropicOCRProvider when both apiKey and model are truthy", () => {
    const provider = buildOcrProvider(
      "anthropic",
      "sk-ant-test",
      "claude-3-5-sonnet",
    );
    expect(provider).toBeInstanceOf(AnthropicOCRProvider);
  });

  it("defaults provider to 'anthropic' when ADMIN_LLM_PROVIDER is unset", () => {
    const provider = buildOcrProvider(
      undefined,
      "sk-ant-test",
      "claude-3-5-sonnet",
    );
    expect(provider).toBeInstanceOf(AnthropicOCRProvider);
  });

  it("returns StubOCRProvider when model is missing", () => {
    const provider = buildOcrProvider("anthropic", "sk-ant-test", undefined);
    expect(provider).toBeInstanceOf(StubOCRProvider);
  });

  it("returns StubOCRProvider when apiKey is missing", () => {
    const provider = buildOcrProvider(
      "anthropic",
      undefined,
      "claude-3-5-sonnet",
    );
    expect(provider).toBeInstanceOf(StubOCRProvider);
  });

  it("returns StubOCRProvider when both are missing", () => {
    const provider = buildOcrProvider("anthropic", undefined, undefined);
    expect(provider).toBeInstanceOf(StubOCRProvider);
  });

  it("returns StubOCRProvider when apiKey is empty string", () => {
    expect(
      buildOcrProvider("anthropic", "", "claude-3-5-sonnet-latest"),
    ).toBeInstanceOf(StubOCRProvider);
  });

  it("returns StubOCRProvider when model is empty string", () => {
    expect(buildOcrProvider("anthropic", "sk-ant-test", "")).toBeInstanceOf(
      StubOCRProvider,
    );
  });

  it("returns StubOCRProvider when both are empty strings", () => {
    expect(buildOcrProvider("anthropic", "", "")).toBeInstanceOf(
      StubOCRProvider,
    );
  });

  it("throws for an unsupported provider", () => {
    expect(() =>
      buildOcrProvider("azure-openai", "sk-ant-test", "claude-3-5-sonnet"),
    ).toThrow(/Unsupported OCR provider: azure-openai/);
  });
});

describe("buildLlmProvider", () => {
  it("returns AnthropicLLMProvider + resolved name when both apiKey and model are truthy", () => {
    const { provider, providerName } = buildLlmProvider(
      "anthropic",
      "sk-ant-test",
      "claude-3-5-sonnet",
    );
    expect(provider).toBeInstanceOf(AnthropicLLMProvider);
    // #748 ADR-006: the recorded name is the resolved provider, not env raw.
    expect(providerName).toBe("anthropic");
  });

  it("defaults provider to 'anthropic' when ADMIN_LLM_PROVIDER is unset", () => {
    const { provider, providerName } = buildLlmProvider(
      undefined,
      "sk-ant-test",
      "claude-3-5-sonnet",
    );
    expect(provider).toBeInstanceOf(AnthropicLLMProvider);
    expect(providerName).toBe("anthropic");
  });

  it("returns StubLLMProvider when model is missing", () => {
    const { provider } = buildLlmProvider(
      "anthropic",
      "sk-ant-test",
      undefined,
    );
    expect(provider).toBeInstanceOf(StubLLMProvider);
  });

  it("returns StubLLMProvider when apiKey is missing", () => {
    const { provider } = buildLlmProvider(
      "anthropic",
      undefined,
      "claude-3-5-sonnet",
    );
    expect(provider).toBeInstanceOf(StubLLMProvider);
  });

  it("returns StubLLMProvider when both are missing", () => {
    const { provider } = buildLlmProvider("anthropic", undefined, undefined);
    expect(provider).toBeInstanceOf(StubLLMProvider);
  });

  it("returns StubLLMProvider when apiKey is empty string", () => {
    expect(
      buildLlmProvider("anthropic", "", "claude-3-5-sonnet-latest").provider,
    ).toBeInstanceOf(StubLLMProvider);
  });

  it("returns StubLLMProvider when model is empty string", () => {
    expect(
      buildLlmProvider("anthropic", "sk-ant-test", "").provider,
    ).toBeInstanceOf(StubLLMProvider);
  });

  it("returns StubLLMProvider when both are empty strings", () => {
    expect(buildLlmProvider("anthropic", "", "").provider).toBeInstanceOf(
      StubLLMProvider,
    );
  });

  it("throws for an unsupported provider", () => {
    expect(() =>
      buildLlmProvider("azure-openai", "sk-ant-test", "claude-3-5-sonnet"),
    ).toThrow(/Unsupported LLM provider: azure-openai/);
  });
});

describe("buildPdfExtractor", () => {
  it("returns AnthropicPDFExtractor when both apiKey and model are truthy", () => {
    const extractor = buildPdfExtractor(
      "anthropic",
      "sk-ant-test",
      "claude-3-5-sonnet",
    );
    expect(extractor).toBeInstanceOf(AnthropicPDFExtractor);
  });

  it("defaults provider to 'anthropic' when ADMIN_LLM_PROVIDER is unset", () => {
    const extractor = buildPdfExtractor(
      undefined,
      "sk-ant-test",
      "claude-3-5-sonnet",
    );
    expect(extractor).toBeInstanceOf(AnthropicPDFExtractor);
  });

  it("returns StubPDFExtractor when model is missing", () => {
    const extractor = buildPdfExtractor("anthropic", "sk-ant-test", undefined);
    expect(extractor).toBeInstanceOf(StubPDFExtractor);
  });

  it("returns StubPDFExtractor when apiKey is missing", () => {
    const extractor = buildPdfExtractor(
      "anthropic",
      undefined,
      "claude-3-5-sonnet",
    );
    expect(extractor).toBeInstanceOf(StubPDFExtractor);
  });

  it("returns StubPDFExtractor when both are missing", () => {
    const extractor = buildPdfExtractor("anthropic", undefined, undefined);
    expect(extractor).toBeInstanceOf(StubPDFExtractor);
  });

  it("returns StubPDFExtractor when apiKey is empty string", () => {
    expect(
      buildPdfExtractor("anthropic", "", "claude-3-5-sonnet-latest"),
    ).toBeInstanceOf(StubPDFExtractor);
  });

  it("returns StubPDFExtractor when model is empty string", () => {
    expect(buildPdfExtractor("anthropic", "sk-ant-test", "")).toBeInstanceOf(
      StubPDFExtractor,
    );
  });

  it("returns StubPDFExtractor when both are empty strings", () => {
    expect(buildPdfExtractor("anthropic", "", "")).toBeInstanceOf(
      StubPDFExtractor,
    );
  });

  it("throws for an unsupported provider", () => {
    expect(() =>
      buildPdfExtractor("azure-openai", "sk-ant-test", "claude-3-5-sonnet"),
    ).toThrow(/Unsupported PDF provider: azure-openai/);
  });
});

describe("createConsumerContainer — env / ctx → adapter mapping", () => {
  it("returns all RequestContainer fields plus the worker-only ports", async () => {
    const container = await createConsumerContainer(envWithBindings());
    expect(container.outboxRepository).toBeDefined();
    expect(container.idempotencyStore).toBeDefined();
    expect(container.indexJobRepository).toBeDefined();
    expect(container.unitOfWorkProvider).toBeDefined();
    expect(container.tempFileStorage).toBeDefined();
    expect(container.objectStorage).toBeDefined();
    expect(container.llmProvider).toBeDefined();
    expect(container.ocrProvider).toBeDefined();
    expect(container.pdfExtractor).toBeDefined();
    expect(container.secretBox).toBeDefined();
  });

  it("does not invoke ctx.waitUntil during container construction", async () => {
    // Container build itself must be side-effect-free with respect to
    // `waitUntil` — the kick only fires when a UoW commit publishes an
    // event. Guards against accidental eager-fetch wiring.
    const ctx = { waitUntil: vi.fn() };
    const container = await createConsumerContainer(envWithBindings(), ctx);
    expect(container).toBeDefined();
    expect(ctx.waitUntil).not.toHaveBeenCalled();
  });

  it("threads ServerEnv R2 + LLM bindings through to the right adapters", async () => {
    const container = await createConsumerContainer(
      envWithBindings({
        TEMP_FILES: fakeBucket(),
        OBJECT_STORAGE: fakeBucket(),
        R2_ACCOUNT_ID: "acc",
        R2_ACCESS_KEY_ID: "key",
        R2_SECRET_ACCESS_KEY: "sec",
        R2_OBJECT_BUCKET_NAME: "buck",
        ADMIN_LLM_API_KEY: "sk-ant-test",
        ADMIN_LLM_MODEL: "claude-3-5-sonnet-latest",
        ADMIN_LLM_PROVIDER: "anthropic",
      }),
    );
    expect(container.tempFileStorage).toBeInstanceOf(R2TempFileStorage);
    expect(container.objectStorage).toBeInstanceOf(R2ObjectStorage);
    expect(container.llmProvider).toBeInstanceOf(AnthropicLLMProvider);
    expect(container.ocrProvider).toBeInstanceOf(AnthropicOCRProvider);
    expect(container.pdfExtractor).toBeInstanceOf(AnthropicPDFExtractor);
  });

  it("propagates ADMIN_LLM_PROVIDER env to the factory: throws on unsupported value", async () => {
    // Guards the env → readRequestServerConfig → buildXxxProvider chain
    // for the consumer worker. If the conditional spread of
    // `adminLlmProvider` regresses, this test catches it because the
    // factory's `default: throw` only fires when the value reaches it.
    await expect(
      createConsumerContainer(
        envWithBindings({
          ADMIN_LLM_API_KEY: "sk-ant-test",
          ADMIN_LLM_MODEL: "claude-3-5-sonnet-latest",
          ADMIN_LLM_PROVIDER: "unsupported-x",
        }),
      ),
    ).rejects.toThrow(/Unsupported LLM provider: unsupported-x/);
  });

  it.each([
    ["R2_ACCOUNT_ID"],
    ["R2_ACCESS_KEY_ID"],
    ["R2_SECRET_ACCESS_KEY"],
    ["R2_OBJECT_BUCKET_NAME"],
    ["OBJECT_STORAGE"],
  ] as const)("downgrades to an unavailable ObjectStorage adapter when %s is missing (every port method rejects with StorageUnavailableError)", async (missingKey) => {
    const partial: Partial<ServerEnv> = {
      OBJECT_STORAGE: fakeBucket(),
      R2_ACCOUNT_ID: "acc",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "sec",
      R2_OBJECT_BUCKET_NAME: "buck",
    };
    delete partial[missingKey];
    const container = await createConsumerContainer(envWithBindings(partial));
    await assertObjectStoragePortUnavailable(container.objectStorage);
  });

  it("downgrades to an unavailable TempFileStorage adapter when TEMP_FILES is missing (every port method rejects with TempFileStorageUnavailableError)", async () => {
    // Symmetric coverage for the consumer container path: omitting the
    // `TEMP_FILES` R2 binding must result in the inline unavailable
    // adapter rather than a partially-wired `R2TempFileStorage`.
    const container = await createConsumerContainer(envWithBindings());
    await assertTempFileStoragePortUnavailable(container.tempFileStorage);
  });

  it("does not honour relayTriggerOverride — consumer path always builds its own RelayTrigger from env (Issue #66 ADR-003)", async () => {
    // The override seam is request-path-only. `createConsumerContainer`
    // calls `readRequestServerConfig(env, ctx)` internally, and that
    // reader does not surface any `relayTriggerOverride` — even if the
    // entry tried to inject one, it would be dropped before reaching
    // the UoW provider. This anchors the production zero-impact claim.
    const container = await createConsumerContainer(envWithBindings());
    const trigger = (
      container.unitOfWorkProvider as unknown as {
        readonly relayTrigger: unknown;
      }
    ).relayTrigger;
    expect(trigger).toBe(NoopRelayTrigger);
  });
});
