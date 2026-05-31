import type { D1Database } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import {
  isSecretBoxError,
  SecretBoxErrorCode,
} from "@/core/domain/adminSettings/ports/secretBox";
import {
  createRequestContainer,
  readRequestServerConfig,
  type ServerEnv,
} from "../serverCloudflare";

// drizzle's D1 client wraps the binding without issuing I/O at
// construction time, so a stand-in object is enough for the node-pool
// wiring tests below.
const fakeBinding = {} as D1Database;

function baseEnv(overrides: Partial<ServerEnv> = {}): ServerEnv {
  return {
    DB: fakeBinding,
    APP_URL: "http://localhost:3000",
    ...overrides,
  };
}

describe("REQUIRE_SECRET_BOX_KEY threading", () => {
  it("resolves requireSecretBoxKey: true from the env var", () => {
    const config = readRequestServerConfig(
      baseEnv({ REQUIRE_SECRET_BOX_KEY: "true" }),
    );
    expect(config.requireSecretBoxKey).toBe(true);
  });

  it("resolves requireSecretBoxKey: false when the env var is unset", () => {
    const config = readRequestServerConfig(baseEnv());
    expect(config.requireSecretBoxKey).toBe(false);
  });

  it("fails fast at container build when the key is required but unset", () => {
    const config = readRequestServerConfig(
      baseEnv({ REQUIRE_SECRET_BOX_KEY: "true" }),
    );
    try {
      createRequestContainer(config);
      expect.unreachable("expected createRequestContainer to throw");
    } catch (error) {
      expect(isSecretBoxError(error)).toBe(true);
      if (isSecretBoxError(error)) {
        expect(error.code).toBe(SecretBoxErrorCode.KeyUnavailable);
      }
    }
  });

  it("keeps the NullSecretBox fallback when the key is not required and unset", async () => {
    const config = readRequestServerConfig(baseEnv());
    const container = createRequestContainer(config);
    await expect(container.secretBox.encrypt("payload")).rejects.toSatisfy(
      (error: unknown) => {
        expect(isSecretBoxError(error)).toBe(true);
        if (isSecretBoxError(error)) {
          expect(error.code).toBe(SecretBoxErrorCode.KeyUnavailable);
        }
        return true;
      },
    );
  });
});

describe("SECRET_BOX_MASTER_KEY_PREVIOUS threading (Issue #370)", () => {
  // A valid base64 32-byte key distinct from the dev placeholder.
  const PREVIOUS_KEY = "AQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQE=";

  it("secretBoxPrevious is null when the previous key is unset", () => {
    const config = readRequestServerConfig(baseEnv());
    const container = createRequestContainer(config);
    expect(container.secretBoxPrevious).toBeNull();
  });

  it("threads the previous key into the request container as a usable SecretBox", async () => {
    const config = readRequestServerConfig(
      baseEnv({ SECRET_BOX_MASTER_KEY_PREVIOUS: PREVIOUS_KEY }),
    );
    expect(config.secretBoxMasterKeyPrevious).toBe(PREVIOUS_KEY);
    const container = createRequestContainer(config);
    expect(container.secretBoxPrevious).not.toBeNull();
    const box = container.secretBoxPrevious;
    if (box === null) throw new Error("expected a previous SecretBox");
    const cipher = await box.encrypt("rotation-payload");
    await expect(box.decrypt(cipher)).resolves.toBe("rotation-payload");
  });
});
