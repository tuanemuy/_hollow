import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { isBusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import {
  ShareLinkId,
  ShareLinkTokenHash,
} from "@/core/domain/publication/valueObject";
import { isNotFoundError } from "../../errors";
import { resolveShareLink } from "../resolveShareLink";
import { hashShareLinkToken } from "../token";

const TZ = new Date("2026-03-01T00:00:00.000Z").toISOString();

let counter = 0;
const nextId = (prefix: number): string => {
  counter += 1;
  const block = counter.toString(16).padStart(4, "0");
  const tail = prefix.toString(16).padStart(2, "0");
  return `0193e7e0-${block}-7000-8000-0000000000${tail}`;
};

function withFixedClock(c: TestContainer, t: Date): TestContainer {
  return { ...c, clock: { now: () => t } };
}

async function seedUser(container: TestContainer): Promise<UserId> {
  const id = nextId(0x0a);
  await container.db.insert(schema.users).values({
    id,
    name: "T",
    email: `${id}@example.com`,
    emailVerified: 1,
    createdAt: TZ,
    updatedAt: TZ,
    username: `u-${id.slice(9, 13)}`,
    role: "member",
    banned: 0,
  });
  return id as UserId;
}

async function seedDirectory(
  container: TestContainer,
  ownerId: UserId,
): Promise<DirectoryId> {
  const id = nextId(0x0b);
  await container.db.insert(schema.directories).values({
    id,
    ownerId,
    parentId: null,
    name: "root",
    slug: `d-${id.slice(9, 13)}`,
    depth: 0,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id as DirectoryId;
}

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: DirectoryId,
): Promise<NoteId> {
  const id = nextId(0x0c);
  await container.db.insert(schema.notes).values({
    id,
    ownerId,
    directoryId,
    slug: `n-${id.slice(9, 13)}`,
    title: "seeded",
    contentHtml: "<p>seed</p>",
    frontMatterJson: "{}",
    status: "active",
    trashedAt: null,
    sourceFileId: null,
    createdAt: TZ,
    updatedAt: TZ,
    editLockUserId: null,
    editLockAcquiredAt: null,
    editLockExpiresAt: null,
    version: 0,
  });
  return id as NoteId;
}

type SeededLink = Readonly<{
  id: ShareLinkId;
  tokenHash: ShareLinkTokenHash;
  token: string;
}>;

async function seedShareLink(
  container: TestContainer,
  noteId: NoteId,
  ownerId: UserId,
  opts: {
    password?: string | null;
    status?: "active" | "revoked";
  } = {},
): Promise<SeededLink> {
  const id = nextId(0x0d);
  const token = `tok-${id}`;
  const tokenHashRaw = await hashShareLinkToken(token);
  const passwordHash =
    opts.password != null
      ? await container.passwordHasher.hash(opts.password)
      : null;
  const status = opts.status ?? "active";
  await container.db.insert(schema.shareLinks).values({
    id,
    noteId,
    ownerId,
    tokenHash: tokenHashRaw,
    passwordHash,
    status,
    failedAttempts: 0,
    lockedUntil: null,
    createdAt: TZ,
    revokedAt: status === "revoked" ? TZ : null,
    lastAccessedAt: null,
    updatedAt: TZ,
    version: 0,
  });
  return {
    id: ShareLinkId.create(id),
    tokenHash: ShareLinkTokenHash.create(tokenHashRaw),
    token,
  };
}

describe("resolveShareLink (integration)", () => {
  const getContainer = setupTestContainer();

  // regression for #560: a failed password attempt must persist the
  // incremented counter. The previous implementation threw inside the
  // UoW, discarding the deferred batch, so failedAttempts stayed 0 and
  // the lockout never armed.
  it("persists the failure counter on a wrong password (regression for #560)", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    const link = await seedShareLink(container, noteId, owner, {
      password: "correct-horse",
    });

    try {
      await resolveShareLink({
        container,
        input: {
          token: link.token,
          password: "wrong-password",
          viewerIpHash: null,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) throw error;
      expect(error.code).toBe("share_link_password_invalid");
    }

    const reloaded = await container.unitOfWorkProvider.run(
      async ({ shareLinkRepository }) => shareLinkRepository.findById(link.id),
    );
    expect(reloaded).not.toBeNull();
    expect(reloaded?.entity.failedAttempts).toBe(1);
    expect(reloaded?.entity.lockedUntil).toBeNull();
  });

  // regression for #560: the lockout boundary. recordFailedAttempt arms
  // the lockout when nextAttempts >= maxAttempts(5). So the 5th wrong
  // attempt itself still answers `share_link_password_invalid` while
  // setting lockedUntil; the 6th request hits the early `locked` throw.
  it("arms the lockout on the 5th attempt and rejects the 6th as locked", async () => {
    const fixed = new Date("2026-04-01T10:00:00.000Z");
    const container = withFixedClock(getContainer(), fixed);
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    const link = await seedShareLink(container, noteId, owner, {
      password: "correct-horse",
    });

    for (let i = 1; i <= 5; i += 1) {
      try {
        await resolveShareLink({
          container,
          input: { token: link.token, password: "nope", viewerIpHash: null },
        });
        expect.fail(`attempt ${i} should have thrown`);
      } catch (error) {
        if (!isBusinessRuleError(error)) throw error;
        expect(error.code).toBe("share_link_password_invalid");
      }

      // The lockout must arm on exactly the 5th attempt: after the 4th the
      // counter is 4 and lockedUntil is still null. This pins the off-by-one
      // in recordFailedAttempt (arming neither too early nor too late).
      if (i === 4) {
        const afterFourth = await container.unitOfWorkProvider.run(
          async ({ shareLinkRepository }) =>
            shareLinkRepository.findById(link.id),
        );
        expect(afterFourth?.entity.failedAttempts).toBe(4);
        expect(afterFourth?.entity.lockedUntil).toBeNull();
      }
    }

    const afterFifth = await container.unitOfWorkProvider.run(
      async ({ shareLinkRepository }) => shareLinkRepository.findById(link.id),
    );
    expect(afterFifth?.entity.failedAttempts).toBe(5);
    const lockedUntil = afterFifth?.entity.lockedUntil ?? null;
    expect(lockedUntil).not.toBeNull();
    // 15 minutes after the fixed now (DEFAULT_LOCKOUT_POLICY.lockDurationSec).
    expect(lockedUntil?.getTime()).toBe(fixed.getTime() + 15 * 60 * 1000);

    try {
      await resolveShareLink({
        container,
        input: {
          token: link.token,
          password: "correct-horse",
          viewerIpHash: null,
        },
      });
      expect.fail("6th request should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) throw error;
      expect(error.code).toBe("share_link_locked");
    }
  });

  it("resets the failure counter and records access on a successful resolution", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    const link = await seedShareLink(container, noteId, owner, {
      password: "correct-horse",
    });

    // Two failed attempts first so the counter is non-zero.
    for (let i = 0; i < 2; i += 1) {
      await resolveShareLink({
        container,
        input: { token: link.token, password: "nope", viewerIpHash: null },
      }).catch((error) => {
        if (!isBusinessRuleError(error)) throw error;
      });
    }

    const beforeSuccess = await container.unitOfWorkProvider.run(
      async ({ shareLinkRepository }) => shareLinkRepository.findById(link.id),
    );
    expect(beforeSuccess?.entity.failedAttempts).toBe(2);
    const versionBefore = Number(beforeSuccess?.entity.version ?? 0);

    const output = await resolveShareLink({
      container,
      input: {
        token: link.token,
        password: "correct-horse",
        viewerIpHash: null,
      },
    });
    expect(output.noteId).toBe(noteId);
    expect(output.ownerUsername).toBe(`u-${owner.slice(9, 13)}`);

    const afterSuccess = await container.unitOfWorkProvider.run(
      async ({ shareLinkRepository }) => shareLinkRepository.findById(link.id),
    );
    expect(afterSuccess?.entity.failedAttempts).toBe(0);
    expect(afterSuccess?.entity.lockedUntil).toBeNull();
    expect(afterSuccess?.entity.lastAccessedAt).not.toBeNull();
    // resetFailedAttempts + recordAccess each advance the version (2 saves'
    // worth of Version.next), so a single-write regression on the success
    // path would be caught here.
    expect(Number(afterSuccess?.entity.version)).toBe(versionBefore + 2);
  });

  it("throws share_link_revoked for a revoked link without mutating it", async () => {
    const container = getContainer();
    const owner = await seedUser(container);
    const dir = await seedDirectory(container, owner);
    const noteId = await seedNote(container, owner, dir);
    const link = await seedShareLink(container, noteId, owner, {
      password: null,
      status: "revoked",
    });

    try {
      await resolveShareLink({
        container,
        input: { token: link.token, password: null, viewerIpHash: null },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isBusinessRuleError(error)) throw error;
      expect(error.code).toBe("share_link_revoked");
    }

    // Rejected before any save, so the seeded version (0) is unchanged.
    const reloaded = await container.unitOfWorkProvider.run(
      async ({ shareLinkRepository }) => shareLinkRepository.findById(link.id),
    );
    expect(reloaded?.entity.version).toBe(0);
  });

  it("throws NotFoundError for an unknown token", async () => {
    const container = getContainer();

    try {
      await resolveShareLink({
        container,
        input: { token: "does-not-exist", password: null, viewerIpHash: null },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      expect(error.code).toBe("SHARE_LINK_NOT_FOUND");
    }
  });
});
