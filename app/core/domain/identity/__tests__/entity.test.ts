import { describe, expect, it } from "vitest";
import { isBusinessRuleError, isRehydrationError } from "@/core/domain/error";
import { User } from "../entity";
import { IdentityErrorCode } from "../errorCode";
import {
  EmailAddress,
  MediaAssetId,
  type UserId as UserIdBrand,
  Username,
} from "../valueObject";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

const ID_BASE = "00000000-0000-7000-8000-";
const rawId = (n: number) => `${ID_BASE}${n.toString(16).padStart(12, "0")}`;

const validInput = (
  n: number,
  overrides: Partial<{
    role: "member" | "admin";
    displayName: string | null;
  }> = {},
) => ({
  id: rawId(n),
  username: Username.create(`user${n}`),
  email: EmailAddress.create(`user${n}@example.com`),
  displayName: overrides.displayName ?? null,
  role: overrides.role ?? ("member" as const),
});

describe("User.create", () => {
  it("produces a PendingUser with the provided fields", () => {
    const { entity } = User.create(validInput(1), T0);
    expect(entity.status).toBe("pending");
    expect(entity.id as unknown as string).toBe(rawId(1));
    expect(entity.username as unknown as string).toBe("user1");
    expect(entity.email as unknown as string).toBe("user1@example.com");
    expect(entity.role).toBe("member");
    expect(entity.bio).toBeNull();
    expect(entity.avatarMediaId).toBeNull();
    expect(entity.version).toBe(0);
    expect(entity.lastUsernameChangedAt).toBeNull();
  });

  it("defaults displayName to username when displayName is null", () => {
    const { entity } = User.create(validInput(2), T0);
    expect(entity.displayName).toBe("user2");
  });

  it("uses provided displayName when given", () => {
    const { entity } = User.create(
      validInput(3, { displayName: "Custom Name" }),
      T0,
    );
    expect(entity.displayName).toBe("Custom Name");
  });

  it("can create an admin user", () => {
    const { entity } = User.create(validInput(4, { role: "admin" }), T0);
    expect(entity.role).toBe("admin");
  });

  it("sets createdAt and updatedAt to the supplied now", () => {
    const { entity } = User.create(validInput(5), at(100));
    expect(entity.createdAt.getTime()).toBe(at(100).getTime());
    expect(entity.updatedAt.getTime()).toBe(at(100).getTime());
  });

  it("emits a single user.created draft", () => {
    const { entity, eventDrafts } = User.create(validInput(6), at(7));
    expect(eventDrafts).toHaveLength(1);
    const draft = eventDrafts[0];
    if (!draft) return;
    expect(draft.type).toBe("user.created");
    if (draft.type !== "user.created") return;
    expect(draft.payload.userId).toBe(entity.id);
    expect(draft.aggregateId).toBe(entity.id);
    expect(draft.occurredAt.getTime()).toBe(at(7).getTime());
  });
});

describe("User.activate", () => {
  it("transitions pending -> active and bumps version", () => {
    const { entity: pending } = User.create(validInput(10), T0);
    const active = User.activate(pending, at(1));
    expect(active.status).toBe("active");
    expect(active.version).toBe(pending.version + 1);
    expect(active.updatedAt.getTime()).toBe(at(1).getTime());
  });

  it("throws BusinessRuleError when activating a non-pending user", () => {
    const { entity: pending } = User.create(validInput(11), T0);
    const active = User.activate(pending, at(1));
    try {
      User.activate(active, at(2));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IdentityErrorCode.UserNotPending);
      }
    }
  });
});

describe("User.suspend / User.reinstate", () => {
  it("active -> suspended emits user.suspended", () => {
    const { entity: pending } = User.create(validInput(20), T0);
    const active = User.activate(pending, at(1));
    const { entity: suspended, eventDrafts } = User.suspend(active, at(2));
    expect(suspended.status).toBe("suspended");
    expect(suspended.version).toBe(active.version + 1);
    expect(eventDrafts).toHaveLength(1);
    expect(eventDrafts[0]?.type).toBe("user.suspended");
  });

  it("rejects suspending a pending user", () => {
    const { entity: pending } = User.create(validInput(21), T0);
    try {
      User.suspend(pending, at(1));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IdentityErrorCode.UserNotActive);
      }
    }
  });

  it("suspended -> active via reinstate emits user.reinstated", () => {
    const { entity: pending } = User.create(validInput(22), T0);
    const active = User.activate(pending, at(1));
    const { entity: suspended } = User.suspend(active, at(2));
    const { entity: reinstated, eventDrafts } = User.reinstate(
      suspended,
      at(3),
    );
    expect(reinstated.status).toBe("active");
    expect(reinstated.version).toBe(suspended.version + 1);
    expect(eventDrafts[0]?.type).toBe("user.reinstated");
  });

  it("rejects reinstating an active user", () => {
    const { entity: pending } = User.create(validInput(23), T0);
    const active = User.activate(pending, at(1));
    try {
      User.reinstate(active, at(2));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IdentityErrorCode.UserNotSuspended);
      }
    }
  });
});

describe("User.markDeleted", () => {
  it("marks active user deleted and emits user.deleted", () => {
    const { entity: pending } = User.create(validInput(30), T0);
    const active = User.activate(pending, at(1));
    const { entity: deleted, eventDrafts } = User.markDeleted(active, at(2));
    expect(deleted.status).toBe("deleted");
    expect(deleted.version).toBe(active.version + 1);
    expect(eventDrafts[0]?.type).toBe("user.deleted");
    if (eventDrafts[0]?.type === "user.deleted") {
      expect(eventDrafts[0].payload.userId).toBe(deleted.id);
    }
  });

  it("rejects deleting an already-deleted user", () => {
    const { entity: pending } = User.create(validInput(31), T0);
    const active = User.activate(pending, at(1));
    const { entity: deleted } = User.markDeleted(active, at(2));
    try {
      User.markDeleted(deleted, at(3));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IdentityErrorCode.AlreadyDeleted);
      }
    }
  });
});

describe("User.changeUsername", () => {
  it("changes username and sets lastUsernameChangedAt", () => {
    const { entity: pending } = User.create(validInput(40), T0);
    const active = User.activate(pending, at(1));
    const newUsername = Username.create("renamed1");
    const renamed = User.changeUsername(active, newUsername, at(2));
    expect(renamed.username as unknown as string).toBe("renamed1");
    expect(renamed.lastUsernameChangedAt?.getTime()).toBe(at(2).getTime());
    expect(renamed.version).toBe(active.version + 1);
  });

  it("rejects rename within 30-day cooldown", () => {
    const { entity: pending } = User.create(validInput(41), T0);
    const active = User.activate(pending, at(1));
    const next = User.changeUsername(active, Username.create("name001"), at(2));
    try {
      User.changeUsername(next, Username.create("name002"), at(3));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IdentityErrorCode.UsernameChangeTooSoon);
      }
    }
  });

  it("allows rename 30 days after the previous one", () => {
    const { entity: pending } = User.create(validInput(42), T0);
    const active = User.activate(pending, at(1));
    const first = User.changeUsername(
      active,
      Username.create("first001"),
      at(2),
    );
    const after30Days = new Date(
      (first.lastUsernameChangedAt as Date).getTime() +
        30 * 24 * 60 * 60 * 1000,
    );
    const second = User.changeUsername(
      first,
      Username.create("second02"),
      after30Days,
    );
    expect(second.username as unknown as string).toBe("second02");
  });

  it("is a no-op when changing to the same username", () => {
    const { entity: pending } = User.create(validInput(43), T0);
    const active = User.activate(pending, at(1));
    const same = User.changeUsername(active, active.username, at(2));
    // Identity equality - no fresh object built.
    expect(same).toBe(active);
  });

  it("is a no-op for the same username even within the cooldown window", () => {
    const { entity: pending } = User.create(validInput(45), T0);
    const active = User.activate(pending, at(1));
    const renamed = User.changeUsername(
      active,
      Username.create("inwin01"),
      at(2),
    );
    // Resubmitting the current username inside the cooldown must not throw
    // UsernameChangeTooSoon - it changes nothing, so the rate limit on
    // *actual* renames does not apply.
    const same = User.changeUsername(renamed, renamed.username, at(3));
    expect(same).toBe(renamed);
    expect(same.version).toBe(renamed.version);
    expect(same.lastUsernameChangedAt?.getTime()).toBe(
      renamed.lastUsernameChangedAt?.getTime(),
    );
  });

  it("rejects rename on a deleted user", () => {
    const { entity: pending } = User.create(validInput(44), T0);
    const active = User.activate(pending, at(1));
    const { entity: deleted } = User.markDeleted(active, at(2));
    try {
      User.changeUsername(deleted, Username.create("after"), at(3));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IdentityErrorCode.AlreadyDeleted);
      }
    }
  });
});

describe("User.changeEmail / changeDisplayName / changeBio / changeAvatar", () => {
  it("changeEmail updates the email", () => {
    const { entity: pending } = User.create(validInput(50), T0);
    const active = User.activate(pending, at(1));
    const next = User.changeEmail(
      active,
      EmailAddress.create("new@example.com"),
      at(2),
    );
    expect(next.email as unknown as string).toBe("new@example.com");
    expect(next.version).toBe(active.version + 1);
  });

  it("changeEmail to same value is a no-op", () => {
    const { entity: pending } = User.create(validInput(51), T0);
    const active = User.activate(pending, at(1));
    const same = User.changeEmail(active, active.email, at(2));
    expect(same).toBe(active);
  });

  it("changeDisplayName trims and rejects empty", () => {
    const { entity: pending } = User.create(validInput(52), T0);
    const active = User.activate(pending, at(1));
    const next = User.changeDisplayName(active, "  Alice  ", at(2));
    expect(next.displayName).toBe("Alice");
    try {
      User.changeDisplayName(active, "   ", at(3));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
    }
  });

  it("changeDisplayName to the same value is a no-op", () => {
    const { entity: pending } = User.create(validInput(55), T0);
    const active = User.activate(pending, at(1));
    // `displayName` defaults to the username; resubmitting it (incl. with
    // surrounding whitespace that trims to the same value) is a no-op.
    const same = User.changeDisplayName(
      active,
      `  ${active.displayName}  `,
      at(2),
    );
    expect(same).toBe(active);
  });

  it("changeBio accepts null and trims input", () => {
    const { entity: pending } = User.create(validInput(53), T0);
    const active = User.activate(pending, at(1));
    const next = User.changeBio(active, "  hi  ", at(2));
    expect(next.bio).toBe("hi");
    const cleared = User.changeBio(next, null, at(3));
    expect(cleared.bio).toBeNull();
  });

  it("changeBio to the same value is a no-op (incl. null -> null)", () => {
    const { entity: pending } = User.create(validInput(56), T0);
    const active = User.activate(pending, at(1));
    // null -> null: a fresh user has bio === null.
    const stillNull = User.changeBio(active, null, at(2));
    expect(stillNull).toBe(active);
    const withBio = User.changeBio(active, "hello", at(2));
    const same = User.changeBio(withBio, "hello", at(3));
    expect(same).toBe(withBio);
  });

  it("changeAvatar swaps the avatar reference", () => {
    const { entity: pending } = User.create(validInput(54), T0);
    const active = User.activate(pending, at(1));
    const m1 = MediaAssetId.create("media-1");
    const next = User.changeAvatar(active, m1, at(2));
    expect(next.avatarMediaId).toBe(m1);
    const cleared = User.changeAvatar(next, null, at(3));
    expect(cleared.avatarMediaId).toBeNull();
  });

  it("changeAvatar to the same reference is a no-op (incl. null -> null)", () => {
    const { entity: pending } = User.create(validInput(57), T0);
    const active = User.activate(pending, at(1));
    // null -> null: a fresh user has avatarMediaId === null.
    const stillNull = User.changeAvatar(active, null, at(2));
    expect(stillNull).toBe(active);
    const m1 = MediaAssetId.create("media-1");
    const withAvatar = User.changeAvatar(active, m1, at(2));
    const same = User.changeAvatar(withAvatar, m1, at(3));
    expect(same).toBe(withAvatar);
  });
});

describe("User.promoteToAdmin / demoteToMember", () => {
  it("promotes a member to admin", () => {
    const { entity: pending } = User.create(validInput(60), T0);
    const active = User.activate(pending, at(1));
    const promoted = User.promoteToAdmin(active, at(2));
    expect(promoted.role).toBe("admin");
    expect(promoted.version).toBe(active.version + 1);
  });

  it("rejects promoting an already-admin user", () => {
    const { entity: pending } = User.create(
      validInput(61, { role: "admin" }),
      T0,
    );
    const active = User.activate(pending, at(1));
    try {
      User.promoteToAdmin(active, at(2));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IdentityErrorCode.AlreadyAdmin);
      }
    }
  });

  it("demotes admin to member", () => {
    const { entity: pending } = User.create(
      validInput(62, { role: "admin" }),
      T0,
    );
    const active = User.activate(pending, at(1));
    const demoted = User.demoteToMember(active, at(2));
    expect(demoted.role).toBe("member");
  });

  it("rejects demoting an already-member user", () => {
    const { entity: pending } = User.create(validInput(63), T0);
    const active = User.activate(pending, at(1));
    try {
      User.demoteToMember(active, at(2));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(IdentityErrorCode.AlreadyMember);
      }
    }
  });
});

describe("User type guards", () => {
  it("isPending / isActive / isSuspended / isDeleted / isLive narrow correctly", () => {
    const { entity: pending } = User.create(validInput(70), T0);
    expect(User.isPending(pending)).toBe(true);
    expect(User.isLive(pending)).toBe(true);

    const active = User.activate(pending, at(1));
    expect(User.isActive(active)).toBe(true);
    expect(User.isLive(active)).toBe(true);

    const { entity: suspended } = User.suspend(active, at(2));
    expect(User.isSuspended(suspended)).toBe(true);
    expect(User.isLive(suspended)).toBe(true);

    const { entity: deleted } = User.markDeleted(active, at(3));
    expect(User.isDeleted(deleted)).toBe(true);
    expect(User.isLive(deleted)).toBe(false);
  });
});

describe("User.reconstruct", () => {
  const validRow = () => ({
    id: rawId(80),
    username: "okay",
    email: "okay@example.com",
    displayName: "Okay",
    bio: null,
    avatarMediaId: null,
    status: "active",
    role: "member",
    version: 3,
    createdAt: T0,
    updatedAt: at(1),
    lastUsernameChangedAt: null,
  });

  it("rebuilds an entity from a well-formed row", () => {
    const u = User.reconstruct(validRow());
    expect(u.status).toBe("active");
    expect(u.username as unknown as string).toBe("okay");
    expect(u.role).toBe("member");
    expect(u.version).toBe(3);
  });

  it("rebuilds a deleted user", () => {
    const u = User.reconstruct({ ...validRow(), status: "deleted" });
    expect(User.isDeleted(u)).toBe(true);
  });

  it("throws RehydrationError when stored username is invalid", () => {
    try {
      User.reconstruct({ ...validRow(), username: "Bad-NAME" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
      expect(isBusinessRuleError(error)).toBe(false);
      if (isRehydrationError(error)) {
        expect(isBusinessRuleError(error.cause)).toBe(true);
      }
    }
  });

  it("throws RehydrationError when status is unknown", () => {
    try {
      User.reconstruct({ ...validRow(), status: "archived" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when role is unknown", () => {
    try {
      User.reconstruct({ ...validRow(), role: "owner" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when version is negative", () => {
    try {
      User.reconstruct({ ...validRow(), version: -1 });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });
});

// Compile-time sanity: UserIdBrand is structurally a string.
const _typeCheck: UserIdBrand = "abc" as unknown as UserIdBrand;
void _typeCheck;
