import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import { content } from "@/config";
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_LEASE_MS,
  DEFAULT_MAX_ATTEMPTS,
} from "@/core/application/workers/eventRelayWorker";
import { DEFAULT_OUTBOX_RETENTION_MS } from "@/core/application/workers/outboxPrune";
import { SecretBoxError } from "@/core/domain/adminSettings/ports/secretBox";
import { BusinessRuleError } from "@/core/domain/error";
import { IngestionErrorCode } from "@/core/domain/ingestion/errorCode";
import { TempFileStorageUnavailableError } from "@/core/domain/ingestion/ports/tempFileStorage";
import { StorageUnavailableError } from "@/core/domain/media/ports/objectStorage";
import {
  createRequestContainer,
  type RequestServerConfig,
  readPruneTuning,
  readRelayTuning,
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

describe("createRequestContainer", () => {
  it("wires every RequestContainer field with a non-undefined adapter", () => {
    const container = createRequestContainer(configWith());
    for (const [key, value] of Object.entries(container)) {
      expect(value, key).toBeDefined();
    }
  });

  it("falls back to NullSecretBox when SECRET_BOX_MASTER_KEY is unset", async () => {
    const container = createRequestContainer(configWith());
    await expect(container.secretBox.encrypt("payload")).rejects.toBeInstanceOf(
      SecretBoxError,
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

  it("surfaces explicit unavailable errors from production Stubs", async () => {
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
});
