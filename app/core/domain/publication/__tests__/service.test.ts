import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import { ShareLink } from "../entity";
import type { PasswordHasher } from "../ports/passwordHasher";
import { PublicationService, type ShareLinkLockoutPolicy } from "../service";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

const NOTE_ID_BASE = "00000000-0000-7000-8000-";
const noteId = (n: number): NoteId =>
  NoteId.create(`${NOTE_ID_BASE}${n.toString(16).padStart(12, "0")}`);
const SHARE_LINK_ID_BASE = "00000000-0000-7000-9000-";
const shareLinkRawId = (n: number): string =>
  `${SHARE_LINK_ID_BASE}${n.toString(16).padStart(12, "0")}`;
const OWNER_ID = "00000000-0000-7000-a000-000000000001" as UserId;
const TOKEN_HASH = "0123456789abcdef0123456789abcdef";

const newActiveLink = (n: number, passwordHash: string | null = null) =>
  ShareLink.create(
    {
      id: shareLinkRawId(n),
      noteId: noteId(n),
      ownerId: OWNER_ID,
      tokenHash: TOKEN_HASH,
      passwordHash,
    },
    T0,
  ).entity;

/**
 * Predictable hasher fake. `verify` matches when the plaintext equals the
 * sentinel `MATCH_PLAINTEXT`; otherwise mismatch. `hash` echoes back a
 * marker so storage round-trips are observable in tests.
 */
const MATCH_PLAINTEXT = "correct horse";
const fakeHasher: PasswordHasher = {
  hash: async (raw) => `H(${raw})`,
  verify: async (raw, _hash) => raw === MATCH_PLAINTEXT,
};

const policy: ShareLinkLockoutPolicy = { maxAttempts: 5, lockDurationSec: 900 };

describe("PublicationService.verifyShareLinkAccess", () => {
  it("accepts a link with no password and records access", async () => {
    const link = newActiveLink(1, null);
    const result = await PublicationService.verifyShareLinkAccess(
      link,
      null,
      fakeHasher,
      at(10),
      policy,
    );
    expect(result.ok).toBe(true);
    expect(result.updatedLink.lastAccessedAt?.getTime()).toBe(at(10).getTime());
  });

  it("rejects null password on a protected link and increments failedAttempts", async () => {
    const link = newActiveLink(2, "stored-hash");
    const result = await PublicationService.verifyShareLinkAccess(
      link,
      null,
      fakeHasher,
      at(1),
      policy,
    );
    expect(result.ok).toBe(false);
    expect(result.updatedLink.failedAttempts).toBe(1);
  });

  it("matches the correct password, resets failedAttempts, and records access", async () => {
    const link = newActiveLink(3, "stored-hash");
    const failedOnce = ShareLink.recordFailedAttempt(
      link,
      at(0),
      policy.maxAttempts,
      policy.lockDurationSec,
    );
    expect(failedOnce.failedAttempts).toBe(1);

    const result = await PublicationService.verifyShareLinkAccess(
      failedOnce,
      MATCH_PLAINTEXT,
      fakeHasher,
      at(50),
      policy,
    );
    expect(result.ok).toBe(true);
    expect(result.updatedLink.failedAttempts).toBe(0);
    expect(result.updatedLink.lockedUntil).toBeNull();
    expect(result.updatedLink.lastAccessedAt?.getTime()).toBe(at(50).getTime());
  });

  it("mismatched password increments failedAttempts but does not record access", async () => {
    const link = newActiveLink(4, "stored-hash");
    const result = await PublicationService.verifyShareLinkAccess(
      link,
      "wrong",
      fakeHasher,
      at(1),
      policy,
    );
    expect(result.ok).toBe(false);
    expect(result.updatedLink.failedAttempts).toBe(1);
    expect(result.updatedLink.lastAccessedAt).toBeNull();
  });

  it("after maxAttempts failures the link is locked and further attempts are rejected without mutation", async () => {
    let link: ShareLink = newActiveLink(5, "stored-hash");
    for (let i = 0; i < policy.maxAttempts; i++) {
      const r = await PublicationService.verifyShareLinkAccess(
        link,
        "wrong",
        fakeHasher,
        at(0),
        policy,
      );
      link = r.updatedLink;
    }
    expect(link.failedAttempts).toBe(policy.maxAttempts);
    expect(link.lockedUntil).not.toBeNull();

    // While locked, even the correct password is rejected with no mutation.
    const locked = await PublicationService.verifyShareLinkAccess(
      link,
      MATCH_PLAINTEXT,
      fakeHasher,
      at(0),
      policy,
    );
    expect(locked.ok).toBe(false);
    expect(locked.updatedLink).toBe(link);
  });

  it("rejects a revoked link without mutation", async () => {
    const active = newActiveLink(6);
    const { entity: revoked } = ShareLink.revoke(active, at(1));
    const result = await PublicationService.verifyShareLinkAccess(
      revoked,
      null,
      fakeHasher,
      at(2),
      policy,
    );
    expect(result.ok).toBe(false);
    expect(result.updatedLink).toBe(revoked);
  });
});

describe("PublicationService default constants", () => {
  it("DEFAULT_LINK_QUOTA matches the spec (10)", () => {
    expect(PublicationService.DEFAULT_LINK_QUOTA).toBe(10);
  });

  it("DEFAULT_LOCKOUT_POLICY caps at 5 attempts and 15-minute lockout", () => {
    expect(PublicationService.DEFAULT_LOCKOUT_POLICY.maxAttempts).toBe(5);
    expect(PublicationService.DEFAULT_LOCKOUT_POLICY.lockDurationSec).toBe(
      15 * 60,
    );
  });
});
