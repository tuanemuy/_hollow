import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { UserId } from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import { PublicationState, ShareLink } from "../entity";
import type { PublicationVisibility } from "../valueObject";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

const OWNER_ID = "00000000-0000-7000-a000-000000000001" as UserId;
const TOKEN_HASH = "0123456789abcdef0123456789abcdef";

let counter = 0;
const nextNoteIdRaw = (): string => {
  counter += 1;
  return `00000000-0000-7000-8000-${counter.toString(16).padStart(12, "0")}`;
};
const nextNoteId = (): NoteId => NoteId.create(nextNoteIdRaw());
const nextShareLinkRawId = (): string => {
  counter += 1;
  return `00000000-0000-7000-9000-${counter.toString(16).padStart(12, "0")}`;
};

const visibilityArb = fc.constantFrom<PublicationVisibility>(
  "private",
  "unlisted",
  "public",
);

describe("PublicationState.changeVisibility (property)", () => {
  it("private after transition implies publishedAt === null (invariant)", () => {
    fc.assert(
      fc.property(visibilityArb, visibilityArb, (first, second) => {
        const state = PublicationState.create(
          { noteId: nextNoteIdRaw(), ownerId: OWNER_ID },
          T0,
        );
        const { entity: s1 } = PublicationState.changeVisibility(
          state,
          first,
          at(1),
        );
        const { entity: s2 } = PublicationState.changeVisibility(
          s1,
          second,
          at(2),
        );
        if (s2.visibility === "private") {
          expect(s2.publishedAt).toBeNull();
        }
      }),
    );
  });

  it("version is bumped iff the transition actually changes visibility", () => {
    fc.assert(
      fc.property(visibilityArb, visibilityArb, (from, to) => {
        const state = PublicationState.create(
          { noteId: nextNoteIdRaw(), ownerId: OWNER_ID },
          T0,
        );
        const { entity: source } = PublicationState.changeVisibility(
          state,
          from,
          at(1),
        );
        const { entity: target, eventDrafts } =
          PublicationState.changeVisibility(source, to, at(2));
        if (from === to) {
          expect(target).toBe(source);
          expect(eventDrafts).toHaveLength(0);
        } else {
          expect(target.version).toBe(source.version + 1);
          expect(eventDrafts).toHaveLength(1);
          expect(eventDrafts[0]?.type).toBe("note.publish_changed");
        }
      }),
    );
  });

  it("every transition to public re-stamps publishedAt to `now`", () => {
    fc.assert(
      fc.property(
        visibilityArb.filter((v) => v !== "public"),
        fc.integer({ min: 1, max: 1_000_000 }),
        (from, nowMs) => {
          const state = PublicationState.create(
            { noteId: nextNoteIdRaw(), ownerId: OWNER_ID },
            T0,
          );
          const { entity: source } = PublicationState.changeVisibility(
            state,
            from,
            at(0),
          );
          const { entity: pub } = PublicationState.changeVisibility(
            source,
            "public",
            at(nowMs),
          );
          expect(pub.publishedAt?.getTime()).toBe(at(nowMs).getTime());
        },
      ),
    );
  });
});

describe("ShareLink.recordFailedAttempt (property)", () => {
  it("monotonically increments failedAttempts and never above maxAttempts via this op", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 3600 }),
        (attempts, max, lockSec) => {
          const { entity: link0 } = ShareLink.create(
            {
              id: nextShareLinkRawId(),
              noteId: nextNoteId(),
              ownerId: OWNER_ID,
              tokenHash: TOKEN_HASH,
              passwordHash: "hash",
            },
            T0,
          );
          let link = link0;
          for (let i = 0; i < attempts; i++) {
            link = ShareLink.recordFailedAttempt(link, at(0), max, lockSec);
          }
          expect(link.failedAttempts).toBe(attempts);
          if (attempts >= max) {
            expect(link.lockedUntil).not.toBeNull();
          } else {
            expect(link.lockedUntil).toBeNull();
          }
        },
      ),
    );
  });
});

describe("ShareLink.resetFailedAttempts (property)", () => {
  it("is idempotent on a clean link (same instance returned)", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (nowMs) => {
        const { entity: active } = ShareLink.create(
          {
            id: nextShareLinkRawId(),
            noteId: nextNoteId(),
            ownerId: OWNER_ID,
            tokenHash: TOKEN_HASH,
          },
          T0,
        );
        const a = ShareLink.resetFailedAttempts(active, at(nowMs));
        const b = ShareLink.resetFailedAttempts(a, at(nowMs + 1));
        expect(a).toBe(active);
        expect(b).toBe(a);
      }),
    );
  });
});
