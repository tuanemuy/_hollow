import { describe, expect, it } from "vitest";
import { Argon2idPasswordHasher } from "../passwordHasher";

// Fixture generated with the legacy PBKDF2-SHA256 implementation
// (iter=600,000, salt of 16 bytes, 32-byte derived key, encoded as
// `$pbkdf2-sha256$i=<iter>$<saltB64>$<hashB64>`). The plan requires
// verify() to keep accepting this format after the Argon2id swap so
// existing share-link rows continue to authenticate.
const LEGACY_PBKDF2_PASSWORD = "correct horse battery staple";
const LEGACY_PBKDF2_HASH =
  "$pbkdf2-sha256$i=600000$CxIZICcuNTxDSlFYX2ZtdA==$G7yxope+ACYvoH0g7jqPsRH5GKiDgEDK1+9LI36x4cQ=";

describe("Argon2idPasswordHasher", () => {
  it("hash() produces an argon2id PHC-encoded string", async () => {
    const hasher = new Argon2idPasswordHasher();
    const hash = await hasher.hash("a fresh password!1");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verify() returns true for the original password (round-trip)", async () => {
    const hasher = new Argon2idPasswordHasher();
    const hash = await hasher.hash("a fresh password!1");
    await expect(hasher.verify("a fresh password!1", hash)).resolves.toBe(true);
  });

  it("verify() returns false for the wrong password", async () => {
    const hasher = new Argon2idPasswordHasher();
    const hash = await hasher.hash("a fresh password!1");
    await expect(hasher.verify("wrong-password", hash)).resolves.toBe(false);
  });

  it("verify() accepts a legacy PBKDF2-SHA256 fixture (backward compatibility)", async () => {
    const hasher = new Argon2idPasswordHasher();
    await expect(
      hasher.verify(LEGACY_PBKDF2_PASSWORD, LEGACY_PBKDF2_HASH),
    ).resolves.toBe(true);
  });

  it("verify() returns false for a wrong password against a legacy PBKDF2 fixture", async () => {
    const hasher = new Argon2idPasswordHasher();
    await expect(
      hasher.verify("not-the-password", LEGACY_PBKDF2_HASH),
    ).resolves.toBe(false);
  });

  it("verify() returns false (does not throw) for malformed input", async () => {
    const hasher = new Argon2idPasswordHasher();
    await expect(hasher.verify("x", "")).resolves.toBe(false);
    await expect(hasher.verify("x", "no-recognized-prefix")).resolves.toBe(
      false,
    );
    await expect(hasher.verify("x", "$pbkdf2-sha256$broken")).resolves.toBe(
      false,
    );
    await expect(hasher.verify("x", "$argon2id$totally-broken")).resolves.toBe(
      false,
    );
    await expect(
      hasher.verify("x", "$pbkdf2-sha256$i=600000$@@@@$@@@@"),
    ).resolves.toBe(false);
  });
});
