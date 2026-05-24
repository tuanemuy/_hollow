import { describe, expect, it } from "vitest";
import { Argon2idPasswordHasher } from "../passwordHasher";

// Fixtures generated with the legacy PBKDF2-SHA256 implementation
// (salt of 16 bytes, 32-byte derived key, encoded as
// `$pbkdf2-sha256$i=<iter>$<saltB64>$<hashB64>`). Two iteration counts
// are covered: 600,000 was the pre-Workers value, and 100,000 is the
// post-stopgap value mandated by the Cloudflare Workers Web Crypto
// PBKDF2 cap (see Issue #206 background). The plan requires verify()
// to keep accepting both formats after the Argon2id swap so existing
// share-link rows continue to authenticate.
const LEGACY_PBKDF2_PASSWORD = "correct horse battery staple";
const LEGACY_PBKDF2_HASH_ITER_600K =
  "$pbkdf2-sha256$i=600000$CxIZICcuNTxDSlFYX2ZtdA==$G7yxope+ACYvoH0g7jqPsRH5GKiDgEDK1+9LI36x4cQ=";
const LEGACY_PBKDF2_HASH_ITER_100K =
  "$pbkdf2-sha256$i=100000$CxIZICcuNTxDSlFYX2ZtdA==$jIExx6r43JoaFTT8ePAdPLIeiNYC8d/QvunMZx5Z9m8=";

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

  it.each([
    ["iter=600,000 (pre-Workers)", LEGACY_PBKDF2_HASH_ITER_600K],
    ["iter=100,000 (Workers stopgap)", LEGACY_PBKDF2_HASH_ITER_100K],
  ])("verify() accepts a legacy PBKDF2-SHA256 fixture (%s)", async (_label, fixture) => {
    const hasher = new Argon2idPasswordHasher();
    await expect(hasher.verify(LEGACY_PBKDF2_PASSWORD, fixture)).resolves.toBe(
      true,
    );
  });

  it("verify() returns false for a wrong password against a legacy PBKDF2 fixture", async () => {
    const hasher = new Argon2idPasswordHasher();
    await expect(
      hasher.verify("not-the-password", LEGACY_PBKDF2_HASH_ITER_600K),
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
