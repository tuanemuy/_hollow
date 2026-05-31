import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isSecretBoxError,
  SecretBoxErrorCode,
} from "@/core/domain/adminSettings/ports/secretBox";
import {
  NullSecretBox,
  SHIPPED_DEV_PLACEHOLDER_KEY,
  selectSecretBox,
  WebCryptoSecretBox,
} from "../secretBox";

// A valid base64-encoded 32-byte (AES-256) key, distinct from the
// shipped dev placeholder.
const VALID_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

function expectKeyUnavailable(error: unknown): void {
  expect(isSecretBoxError(error)).toBe(true);
  if (isSecretBoxError(error)) {
    expect(error.code).toBe(SecretBoxErrorCode.KeyUnavailable);
  }
}

describe("selectSecretBox", () => {
  it("falls back to NullSecretBox when the key is unset and not required", async () => {
    const box = selectSecretBox({}, { requireKey: false });
    expect(box).toBeInstanceOf(NullSecretBox);
    await expect(box.encrypt("payload")).rejects.toSatisfy((error: unknown) => {
      expectKeyUnavailable(error);
      return true;
    });
    await expect(box.decrypt("payload")).rejects.toSatisfy((error: unknown) => {
      expectKeyUnavailable(error);
      return true;
    });
  });

  it("throws when the key is unset and required", () => {
    try {
      selectSecretBox({}, { requireKey: true });
      expect.unreachable("expected selectSecretBox to throw");
    } catch (error) {
      expectKeyUnavailable(error);
    }
  });

  it("throws when the key is an empty string and required", () => {
    try {
      selectSecretBox({ SECRET_BOX_MASTER_KEY: "" }, { requireKey: true });
      expect.unreachable("expected selectSecretBox to throw");
    } catch (error) {
      expectKeyUnavailable(error);
    }
  });

  it("wires WebCryptoSecretBox for a valid key (requireKey: true) and round-trips", async () => {
    const box = selectSecretBox(
      { SECRET_BOX_MASTER_KEY: VALID_KEY },
      { requireKey: true },
    );
    expect(box).toBeInstanceOf(WebCryptoSecretBox);
    const cipher = await box.encrypt("hello world");
    await expect(box.decrypt(cipher)).resolves.toBe("hello world");
  });

  it("wires WebCryptoSecretBox for a valid key (requireKey: false) and round-trips", async () => {
    const box = selectSecretBox(
      { SECRET_BOX_MASTER_KEY: VALID_KEY },
      { requireKey: false },
    );
    expect(box).toBeInstanceOf(WebCryptoSecretBox);
    const cipher = await box.encrypt("hello world");
    await expect(box.decrypt(cipher)).resolves.toBe("hello world");
  });

  it("throws eagerly for a non-base64 key", () => {
    try {
      selectSecretBox(
        { SECRET_BOX_MASTER_KEY: "not-base64-!!" },
        { requireKey: false },
      );
      expect.unreachable("expected selectSecretBox to throw");
    } catch (error) {
      expectKeyUnavailable(error);
    }
  });

  it("throws eagerly for a base64 key that is not 32 bytes", () => {
    // base64 of "short" — valid base64 but only 5 bytes.
    try {
      selectSecretBox(
        { SECRET_BOX_MASTER_KEY: "c2hvcnQ=" },
        { requireKey: false },
      );
      expect.unreachable("expected selectSecretBox to throw");
    } catch (error) {
      expectKeyUnavailable(error);
    }
  });

  it("refuses the shipped dev placeholder when the key is required", () => {
    try {
      selectSecretBox(
        { SECRET_BOX_MASTER_KEY: SHIPPED_DEV_PLACEHOLDER_KEY },
        { requireKey: true },
      );
      expect.unreachable("expected selectSecretBox to throw");
    } catch (error) {
      expectKeyUnavailable(error);
    }
  });

  it("accepts the shipped dev placeholder when the key is not required", () => {
    const box = selectSecretBox(
      { SECRET_BOX_MASTER_KEY: SHIPPED_DEV_PLACEHOLDER_KEY },
      { requireKey: false },
    );
    expect(box).toBeInstanceOf(WebCryptoSecretBox);
  });
});

describe("SHIPPED_DEV_PLACEHOLDER_KEY", () => {
  it("matches the SECRET_BOX_MASTER_KEY value in .dev.vars.example", () => {
    // Resolve the repo root relative to this file, not the cwd, so the
    // sync check is robust to where vitest is invoked from.
    const devVarsPath = fileURLToPath(
      new URL("../../../../../.dev.vars.example", import.meta.url),
    );
    const contents = readFileSync(devVarsPath, "utf8");
    const match = contents.match(/^SECRET_BOX_MASTER_KEY="([^"]*)"/m);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe(SHIPPED_DEV_PLACEHOLDER_KEY);
  });
});
