import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { UserId } from "@/core/domain/identity/valueObject";
import {
  type AttachedMedia,
  MediaAsset,
  type MediaAsset as MediaAssetT,
  type PendingMedia,
} from "../entity";

/**
 * Property-based tests for the MediaAsset state machine.
 *
 * The shape of the machine:
 *   pending (refCount=0) → attached (refCount>=1) → orphan (refCount=0)
 *   pending → orphan (abandoned intake)
 *   orphan → deleting
 *
 * Properties verified:
 * - increment/decrement is balanced (back to refCount=0 → orphan).
 * - exactly one media.attached fires on the first reference; subsequent
 *   increments are silent.
 * - exactly one media.orphaned fires on the last decrement.
 */

const NOW = new Date(0);
const ID_BASE = "00000000-0000-7000-8000-";
let counter = 0;
const nextIdRaw = (): string => {
  counter += 1;
  return `${ID_BASE}${counter.toString(16).padStart(12, "0")}`;
};
const owner = UserId.create("owner-property");

const freshPending = () =>
  MediaAsset.create(
    {
      id: nextIdRaw(),
      ownerId: owner,
      kind: "image",
      mimeType: "image/png",
      byteSize: 16,
      storageKey: `o/i/${nextIdRaw()}`,
    },
    NOW,
  );

function asIncrementable(asset: MediaAssetT): PendingMedia | AttachedMedia {
  if (asset.status !== "pending" && asset.status !== "attached") {
    throw new Error(`unexpected status mid-walk: ${asset.status}`);
  }
  return asset;
}

describe("MediaAsset lifecycle (property)", () => {
  it("N increments followed by N decrements returns to refCount=0 / orphan", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 8 }), (n) => {
        const { entity: pending } = freshPending();
        let current: MediaAssetT = pending;
        for (let i = 0; i < n; i += 1) {
          const { entity } = MediaAsset.incrementRef(
            asIncrementable(current),
            NOW,
          );
          current = entity;
        }
        expect(current.status).toBe("attached");
        if (current.status !== "attached") return;
        expect(current.refCount).toBe(n);
        for (let i = 0; i < n; i += 1) {
          const { entity } = MediaAsset.decrementRef(
            asIncrementable(current),
            NOW,
          );
          current = entity;
        }
        expect(current.status).toBe("orphan");
        expect(current.refCount).toBe(0);
      }),
    );
  });

  it("only the first increment emits media.attached; subsequent ones are silent", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), (n) => {
        const { entity: pending } = freshPending();
        let current: MediaAssetT = pending;
        let attachedCount = 0;
        for (let i = 0; i < n; i += 1) {
          const { entity, eventDrafts } = MediaAsset.incrementRef(
            asIncrementable(current),
            NOW,
          );
          for (const d of eventDrafts) {
            if (d.type === "media.attached") attachedCount += 1;
          }
          current = entity;
        }
        expect(attachedCount).toBe(1);
      }),
    );
  });

  it("only the final decrement emits media.orphaned", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), (n) => {
        const { entity: pending } = freshPending();
        let current: MediaAssetT = pending;
        for (let i = 0; i < n; i += 1) {
          const { entity } = MediaAsset.incrementRef(
            asIncrementable(current),
            NOW,
          );
          current = entity;
        }
        let orphanCount = 0;
        for (let i = 0; i < n; i += 1) {
          const { entity, eventDrafts } = MediaAsset.decrementRef(
            asIncrementable(current),
            NOW,
          );
          for (const d of eventDrafts) {
            if (d.type === "media.orphaned") orphanCount += 1;
          }
          current = entity;
        }
        expect(orphanCount).toBe(1);
      }),
    );
  });
});

describe("MediaAsset.decrementRef on pending (property)", () => {
  it("always lands on orphan with refCount=0 and emits media.orphaned", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const { entity: pending } = freshPending();
        const { entity: next, eventDrafts } = MediaAsset.decrementRef(
          pending,
          NOW,
        );
        expect(next.status).toBe("orphan");
        expect(next.refCount).toBe(0);
        expect(eventDrafts.map((d) => d.type)).toEqual(["media.orphaned"]);
      }),
    );
  });
});
