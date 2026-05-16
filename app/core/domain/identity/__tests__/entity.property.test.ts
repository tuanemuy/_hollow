import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { User } from "../entity";
import { EmailAddress, Username } from "../valueObject";

/**
 * Property-based tests for User state transitions.
 *
 * Focus is on the invariants that the example-based suite cannot
 * exhaustively cover: monotonic version, idempotent no-ops, status
 * round-trips, and event emission accompanying every state change.
 */

const NOW = new Date(0);

const ID_BASE = "00000000-0000-7000-8000-";
let counter = 0;
const nextRawId = () => {
  counter += 1;
  return `${ID_BASE}${counter.toString(16).padStart(12, "0")}`;
};

const usernameArb = fc
  .stringMatching(/^[a-z][a-z0-9]{2,15}$/)
  .filter(
    (s) =>
      !new Set([
        "admin",
        "api",
        "auth",
        "login",
        "signup",
        "settings",
        "share",
        "static",
        "assets",
      ]).has(s),
  );

const newUser = (username = "alice", role: "member" | "admin" = "member") =>
  User.create(
    {
      id: nextRawId(),
      username: Username.create(username),
      email: EmailAddress.create(`${username}@example.com`),
      displayName: null,
      role,
    },
    NOW,
  );

describe("User lifecycle (property)", () => {
  it("activate then suspend then reinstate bumps version by 3", () => {
    fc.assert(
      fc.property(usernameArb, (u) => {
        const { entity: pending } = newUser(u);
        const active = User.activate(pending, NOW);
        const { entity: suspended } = User.suspend(active, NOW);
        const { entity: reinstated } = User.reinstate(suspended, NOW);
        expect(reinstated.version).toBe(pending.version + 3);
        expect(reinstated.status).toBe("active");
      }),
    );
  });

  it("changeUsername with the same value is identity (no version bump)", () => {
    fc.assert(
      fc.property(usernameArb, (u) => {
        const { entity: pending } = newUser(u);
        const active = User.activate(pending, NOW);
        const same = User.changeUsername(active, active.username, NOW);
        expect(same).toBe(active);
      }),
    );
  });

  it("changeEmail with same value is identity", () => {
    fc.assert(
      fc.property(usernameArb, (u) => {
        const { entity: pending } = newUser(u);
        const active = User.activate(pending, NOW);
        const same = User.changeEmail(active, active.email, NOW);
        expect(same).toBe(active);
      }),
    );
  });
});

describe("User.create / activate (property)", () => {
  it("freshly created users always start as pending with version 0", () => {
    fc.assert(
      fc.property(usernameArb, (u) => {
        const { entity } = newUser(u);
        expect(entity.status).toBe("pending");
        expect(entity.version).toBe(0);
        expect(entity.lastUsernameChangedAt).toBeNull();
      }),
    );
  });

  it("user.created event mirrors aggregate id and the supplied occurredAt", () => {
    fc.assert(
      fc.property(
        usernameArb,
        fc.integer({ min: 0, max: 1_000_000 }),
        (u, ms) => {
          const { entity, eventDrafts } = User.create(
            {
              id: nextRawId(),
              username: Username.create(u),
              email: EmailAddress.create(`${u}@example.com`),
              displayName: null,
              role: "member",
            },
            new Date(ms),
          );
          const draft = eventDrafts[0];
          if (!draft) {
            expect.fail("expected one draft");
            return;
          }
          expect(draft.type).toBe("user.created");
          expect(draft.aggregateId).toBe(entity.id);
          expect(draft.occurredAt.getTime()).toBe(ms);
        },
      ),
    );
  });
});

describe("User.promoteToAdmin / demoteToMember (property)", () => {
  it("promote then demote returns to the original role", () => {
    fc.assert(
      fc.property(usernameArb, (u) => {
        const { entity: pending } = newUser(u);
        const active = User.activate(pending, NOW);
        const promoted = User.promoteToAdmin(active, NOW);
        const demoted = User.demoteToMember(promoted, NOW);
        expect(demoted.role).toBe(active.role);
        // Each transition bumps version by 1.
        expect(demoted.version).toBe(active.version + 2);
      }),
    );
  });
});
