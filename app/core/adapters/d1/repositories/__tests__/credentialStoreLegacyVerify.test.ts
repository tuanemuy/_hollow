import { describe, expect, it } from "vitest";
import { legacyVerifyPbkdf2Hash } from "../credentialStore";

// Fixed PBKDF2-SHA256 fixtures in the admin-side encoded format
// `pbkdf2-sha256-v1$<iter>$<saltB64>$<hashB64>`. Two iteration counts
// reflect the Issue #206 history: iter=600,000 was the pre-Workers
// default, iter=100,000 is the post-stopgap value mandated by the
// Cloudflare Workers Web Crypto cap. Both must continue to verify so
// existing `accounts.password` rows authenticate during the lazy
// upgrade transition. These literals are generated offline (Node
// `crypto.pbkdf2Sync` over the documented salt) so changing the
// production encoder triggers an immediate failure here rather than
// silently accepting a drifted format.
const FIXTURE_PASSWORD = "correct horse battery staple";
const FIXTURE_ITER_100K =
  "pbkdf2-sha256-v1$100000$CxIZICcuNTxDSlFYX2ZtdA==$jIExx6r43JoaFTT8ePAdPLIeiNYC8d/QvunMZx5Z9m8=";
const FIXTURE_ITER_600K =
  "pbkdf2-sha256-v1$600000$CxIZICcuNTxDSlFYX2ZtdA==$G7yxope+ACYvoH0g7jqPsRH5GKiDgEDK1+9LI36x4cQ=";

describe("legacyVerifyPbkdf2Hash (admin credentialStore)", () => {
  it.each([
    ["iter=100,000 (Workers stopgap)", FIXTURE_ITER_100K],
    ["iter=600,000 (pre-Workers)", FIXTURE_ITER_600K],
  ])("accepts a fixed fixture (%s)", async (_label, fixture) => {
    await expect(
      legacyVerifyPbkdf2Hash(FIXTURE_PASSWORD, fixture),
    ).resolves.toBe(true);
  });

  it("rejects the wrong password", async () => {
    await expect(
      legacyVerifyPbkdf2Hash("not-the-password", FIXTURE_ITER_600K),
    ).resolves.toBe(false);
  });

  it("returns false (does not throw) for malformed input", async () => {
    await expect(legacyVerifyPbkdf2Hash("x", "")).resolves.toBe(false);
    await expect(legacyVerifyPbkdf2Hash("x", "no-version")).resolves.toBe(
      false,
    );
    await expect(
      legacyVerifyPbkdf2Hash("x", "pbkdf2-sha256-v1$abc$saltB64$hashB64"),
    ).resolves.toBe(false);
    await expect(
      legacyVerifyPbkdf2Hash("x", "pbkdf2-sha256-v1$600000$@@@@$@@@@"),
    ).resolves.toBe(false);
  });

  it("rejects iterations above the defense-in-depth cap", async () => {
    // 10,000,001 — one above LEGACY_PBKDF2_ITERATIONS_MAX. Even if a
    // malicious row somehow lands in the DB, verify must refuse
    // before kicking off a CPU-burning derivation.
    await expect(
      legacyVerifyPbkdf2Hash(
        FIXTURE_PASSWORD,
        "pbkdf2-sha256-v1$10000001$CxIZICcuNTxDSlFYX2ZtdA==$AAAA",
      ),
    ).resolves.toBe(false);
  });
});
