import { describe, expect, it } from "vitest";
import { hashScrypt, isScryptEncoded, verifyScrypt } from "../scrypt";

describe("scrypt helper", () => {
  it("produces an encoded PHC-style string starting with $scrypt$", async () => {
    const hash = await hashScrypt("hunter22-strong!");
    expect(hash.startsWith("$scrypt$")).toBe(true);
    expect(isScryptEncoded(hash)).toBe(true);
    expect(hash).toMatch(/^\$scrypt\$ln=16,r=8,p=1\$/);
  });

  it("round-trips: verify returns true for the original password", async () => {
    const hash = await hashScrypt("hunter22-strong!");
    await expect(verifyScrypt("hunter22-strong!", hash)).resolves.toBe(true);
  });

  it("returns false for a wrong password", async () => {
    const hash = await hashScrypt("hunter22-strong!");
    await expect(verifyScrypt("wrong-password", hash)).resolves.toBe(false);
  });

  it("returns false for non-scrypt encoded strings without throwing", async () => {
    await expect(verifyScrypt("anything", "")).resolves.toBe(false);
    await expect(
      verifyScrypt("anything", "$pbkdf2-sha256$i=1$a$b"),
    ).resolves.toBe(false);
    await expect(
      verifyScrypt("anything", "pbkdf2-sha256-v1$1$a$b"),
    ).resolves.toBe(false);
    await expect(
      verifyScrypt("anything", "$argon2id$v=19$m=19456,t=2,p=1$YWFh$YWFh"),
    ).resolves.toBe(false);
  });

  it("returns false for a corrupted scrypt-prefixed string without throwing", async () => {
    await expect(verifyScrypt("anything", "$scrypt$broken")).resolves.toBe(
      false,
    );
  });

  it("rejects encoded hashes whose ln/r/p exceed the verify caps before invoking scrypt", async () => {
    // ln=30 (N=2**30 ≈ 1 GiB) would otherwise tie up the worker for
    // minutes. The defensive parse must short-circuit to false.
    await expect(
      verifyScrypt(
        "x",
        "$scrypt$ln=30,r=8,p=1$YWFhYWFhYWFhYWFhYWFhYQ$YWFhYWFh",
      ),
    ).resolves.toBe(false);
    // r=999 — far above the verify block-size cap.
    await expect(
      verifyScrypt(
        "x",
        "$scrypt$ln=16,r=999,p=1$YWFhYWFhYWFhYWFhYWFhYQ$YWFhYWFh",
      ),
    ).resolves.toBe(false);
    // p=999 — far above the verify parallelism cap.
    await expect(
      verifyScrypt(
        "x",
        "$scrypt$ln=16,r=8,p=999$YWFhYWFhYWFhYWFhYWFhYQ$YWFhYWFh",
      ),
    ).resolves.toBe(false);
  });
});
