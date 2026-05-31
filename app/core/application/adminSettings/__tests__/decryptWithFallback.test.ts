import { describe, expect, it } from "vitest";
import {
  type SecretBox,
  SecretBoxError,
  SecretBoxErrorCode,
} from "@/core/domain/adminSettings/ports/secretBox";
import { decryptWithFallback } from "../decryptWithFallback";

/**
 * Minimal `SecretBox` fake. `decrypt` returns the configured plaintext for
 * a known cipher, otherwise throws the configured error. `encrypt` is
 * unused by `decryptWithFallback` and rejects to keep the fake honest.
 */
function fakeBox(opts: {
  plainFor: Record<string, string>;
  decryptError?: SecretBoxError;
}): SecretBox {
  return {
    async encrypt(): Promise<string> {
      throw new Error("not used");
    },
    async decrypt(cipher: string): Promise<string> {
      const plain = opts.plainFor[cipher];
      if (plain !== undefined) return plain;
      throw (
        opts.decryptError ??
        new SecretBoxError(SecretBoxErrorCode.DecryptFailed, "decrypt failed")
      );
    },
  };
}

describe("decryptWithFallback", () => {
  it("returns the plaintext from the current key when it succeeds (no previous-key attempt)", async () => {
    let previousCalled = false;
    const current = fakeBox({ plainFor: { "cipher-new": "plain" } });
    const previous: SecretBox = {
      async encrypt() {
        throw new Error("not used");
      },
      async decrypt() {
        previousCalled = true;
        return "should-not-be-used";
      },
    };

    await expect(
      decryptWithFallback(current, previous, "cipher-new"),
    ).resolves.toBe("plain");
    expect(previousCalled).toBe(false);
  });

  it("falls back to the previous key when the current key raises DecryptFailed", async () => {
    const current = fakeBox({
      plainFor: {},
      decryptError: new SecretBoxError(
        SecretBoxErrorCode.DecryptFailed,
        "tag mismatch",
      ),
    });
    const previous = fakeBox({ plainFor: { "cipher-old": "plain-from-old" } });

    await expect(
      decryptWithFallback(current, previous, "cipher-old"),
    ).resolves.toBe("plain-from-old");
  });

  it("propagates the original error when DecryptFailed but no previous key is configured", async () => {
    const current = fakeBox({
      plainFor: {},
      decryptError: new SecretBoxError(
        SecretBoxErrorCode.DecryptFailed,
        "tag mismatch",
      ),
    });

    await expect(
      decryptWithFallback(current, null, "cipher-old"),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(SecretBoxError);
      expect((error as SecretBoxError).code).toBe(
        SecretBoxErrorCode.DecryptFailed,
      );
      return true;
    });
  });

  it("propagates DecryptFailed (no fabricated plaintext) when neither the current nor the previous key can decrypt", async () => {
    // A ciphertext encrypted under an unrelated third key: both the current
    // and previous keys raise DecryptFailed (AES-GCM tag mismatch). The
    // helper must surface the previous-key failure rather than returning a
    // bogus plaintext or silently succeeding.
    const current = fakeBox({
      plainFor: {},
      decryptError: new SecretBoxError(
        SecretBoxErrorCode.DecryptFailed,
        "tag mismatch (current key)",
      ),
    });
    const previous = fakeBox({
      plainFor: {},
      decryptError: new SecretBoxError(
        SecretBoxErrorCode.DecryptFailed,
        "tag mismatch (previous key)",
      ),
    });

    await expect(
      decryptWithFallback(current, previous, "cipher-from-third-key"),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(SecretBoxError);
      expect((error as SecretBoxError).code).toBe(
        SecretBoxErrorCode.DecryptFailed,
      );
      return true;
    });
  });

  it("does not fall back on InvalidCiphertext (propagates it even with a previous key)", async () => {
    let previousCalled = false;
    const current = fakeBox({
      plainFor: {},
      decryptError: new SecretBoxError(
        SecretBoxErrorCode.InvalidCiphertext,
        "bad version byte",
      ),
    });
    const previous: SecretBox = {
      async encrypt() {
        throw new Error("not used");
      },
      async decrypt() {
        previousCalled = true;
        return "should-not-be-used";
      },
    };

    await expect(
      decryptWithFallback(current, previous, "cipher"),
    ).rejects.toSatisfy((error: unknown) => {
      expect((error as SecretBoxError).code).toBe(
        SecretBoxErrorCode.InvalidCiphertext,
      );
      return true;
    });
    expect(previousCalled).toBe(false);
  });
});
