import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { Directory } from "../entity";
import { DirectoryErrorCode } from "../errorCode";
import {
  DirectoryDepth,
  DirectoryName,
  MAX_DIRECTORY_DEPTH,
} from "../valueObject";

const T0 = new Date(0);
const OWNER = "owner-1" as unknown as UserId;
const ID_BASE = "00000000-0000-7000-8000-";
let counter = 0;
const nextRawId = () => {
  counter += 1;
  return `${ID_BASE}${counter.toString(16).padStart(12, "0")}`;
};

const nameArb = fc.stringMatching(/^[a-z][a-z0-9 ]{0,40}$/);

describe("Directory.create (property)", () => {
  it("the produced child always satisfies depth = parent.depth + 1", () => {
    fc.assert(
      fc.property(
        nameArb,
        fc.integer({ min: 0, max: MAX_DIRECTORY_DEPTH - 1 }),
        (raw, parentDepth) => {
          // Build a synthetic parent at the chosen depth via reconstruct.
          const parent = Directory.reconstruct({
            id: nextRawId(),
            ownerId: OWNER as unknown as string,
            parentId: parentDepth === 0 ? null : nextRawId(),
            name: parentDepth === 0 ? "" : "p",
            slug: parentDepth === 0 ? "" : "p",
            depth: parentDepth,
            version: 0,
            createdAt: T0,
            updatedAt: T0,
          });
          const child = Directory.create(
            {
              id: nextRawId(),
              ownerId: OWNER,
              parent,
              name: DirectoryName.create(raw),
            },
            T0,
          );
          expect(child.depth as number).toBe(parentDepth + 1);
        },
      ),
    );
  });

  it("throws TooDeep when the parent is at MAX_DIRECTORY_DEPTH", () => {
    fc.assert(
      fc.property(nameArb, (raw) => {
        const parent = Directory.reconstruct({
          id: nextRawId(),
          ownerId: OWNER as unknown as string,
          parentId: nextRawId(),
          name: "p",
          slug: "p",
          depth: MAX_DIRECTORY_DEPTH,
          version: 0,
          createdAt: T0,
          updatedAt: T0,
        });
        try {
          Directory.create(
            {
              id: nextRawId(),
              ownerId: OWNER,
              parent,
              name: DirectoryName.create(raw),
            },
            T0,
          );
          expect.fail("should have thrown");
        } catch (error) {
          expect(isBusinessRuleError(error)).toBe(true);
          if (isBusinessRuleError(error)) {
            expect(error.code).toBe(DirectoryErrorCode.TooDeep);
          }
        }
      }),
    );
  });
});

describe("Directory.rename (property)", () => {
  it("renaming to a name equal modulo case is a no-op (same instance, no version bump)", () => {
    fc.assert(
      fc.property(nameArb, (raw) => {
        const root = Directory.createRoot(
          { id: nextRawId(), ownerId: OWNER },
          T0,
        );
        const child = Directory.create(
          {
            id: nextRawId(),
            ownerId: OWNER,
            parent: root,
            name: DirectoryName.create(raw),
          },
          T0,
        );
        const renamed = Directory.rename(
          child,
          DirectoryName.create(raw.toUpperCase()),
          new Date(99),
        );
        expect(renamed).toBe(child);
        expect(renamed.version).toBe(child.version);
      }),
    );
  });

  it("changing the name bumps version by exactly 1", () => {
    fc.assert(
      fc.property(nameArb, nameArb, (a, b) => {
        // DirectoryName.create() trims whitespace, so compare the
        // post-trim case-folded form to match DirectoryName.equals(),
        // otherwise pairs like ("b", "b ") slip past the precondition
        // and the rename becomes a no-op.
        fc.pre(a.trim().toLowerCase() !== b.trim().toLowerCase());
        const root = Directory.createRoot(
          { id: nextRawId(), ownerId: OWNER },
          T0,
        );
        const child = Directory.create(
          {
            id: nextRawId(),
            ownerId: OWNER,
            parent: root,
            name: DirectoryName.create(a),
          },
          T0,
        );
        const renamed = Directory.rename(
          child,
          DirectoryName.create(b),
          new Date(1),
        );
        expect(renamed.version).toBe(child.version + 1);
      }),
    );
  });
});

describe("Directory.recomputeDepth (property)", () => {
  it("is idempotent when invoked with the same parent depth", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: MAX_DIRECTORY_DEPTH - 1 }),
        (parentDepth) => {
          const parent = Directory.reconstruct({
            id: nextRawId(),
            ownerId: OWNER as unknown as string,
            parentId: parentDepth === 0 ? null : nextRawId(),
            name: parentDepth === 0 ? "" : "p",
            slug: parentDepth === 0 ? "" : "p",
            depth: parentDepth,
            version: 0,
            createdAt: T0,
            updatedAt: T0,
          });
          const child = Directory.create(
            {
              id: nextRawId(),
              ownerId: OWNER,
              parent,
              name: DirectoryName.create("c"),
            },
            T0,
          );
          const parentDepthVO = DirectoryDepth.create(parentDepth);
          const a = Directory.recomputeDepth(child, parentDepthVO, new Date(1));
          const b = Directory.recomputeDepth(a, parentDepthVO, new Date(2));
          // First call already had the right depth so returns the same
          // instance; second call must do the same.
          expect(a).toBe(child);
          expect(b).toBe(a);
        },
      ),
    );
  });
});
