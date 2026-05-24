import { describe, expect, it } from "vitest";
import { hashArgon2id, isArgon2idEncoded, verifyArgon2id } from "../argon2id";

describe("argon2id helper", () => {
  it("produces an encoded PHC string starting with $argon2id$", async () => {
    const hash = await hashArgon2id("hunter22-strong!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(isArgon2idEncoded(hash)).toBe(true);
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it("round-trips: verify returns true for the original password", async () => {
    const hash = await hashArgon2id("hunter22-strong!");
    await expect(verifyArgon2id("hunter22-strong!", hash)).resolves.toBe(true);
  });

  it("returns false for a wrong password", async () => {
    const hash = await hashArgon2id("hunter22-strong!");
    await expect(verifyArgon2id("wrong-password", hash)).resolves.toBe(false);
  });

  it("returns false for non-argon2id encoded strings without throwing", async () => {
    await expect(verifyArgon2id("anything", "")).resolves.toBe(false);
    await expect(
      verifyArgon2id("anything", "$pbkdf2-sha256$i=1$a$b"),
    ).resolves.toBe(false);
    await expect(
      verifyArgon2id("anything", "pbkdf2-sha256-v1$1$a$b"),
    ).resolves.toBe(false);
  });

  it("returns false for a corrupted argon2id-prefixed string without throwing", async () => {
    await expect(verifyArgon2id("anything", "$argon2id$broken")).resolves.toBe(
      false,
    );
  });

  it("rejects encoded hashes whose m/t/p exceed the verify caps before invoking WASM", async () => {
    // m = 100,000,000 KiB (≈ 100 GiB) would otherwise be handed to
    // hash-wasm and trigger a huge linear-memory allocation. The
    // defensive parse in `verifyArgon2id` must short-circuit to false.
    await expect(
      verifyArgon2id(
        "x",
        "$argon2id$v=19$m=100000000,t=2,p=1$YWFhYWFhYWFhYWFhYWFhYQ$YWFhYWFh",
      ),
    ).resolves.toBe(false);
    // t = 9999 — far above the verify iterations cap.
    await expect(
      verifyArgon2id(
        "x",
        "$argon2id$v=19$m=19456,t=9999,p=1$YWFhYWFhYWFhYWFhYWFhYQ$YWFhYWFh",
      ),
    ).resolves.toBe(false);
    // p = 999 — far above the verify parallelism cap.
    await expect(
      verifyArgon2id(
        "x",
        "$argon2id$v=19$m=19456,t=2,p=999$YWFhYWFhYWFhYWFhYWFhYQ$YWFhYWFh",
      ),
    ).resolves.toBe(false);
  });
});
