import { describe, expect, it } from "vitest";
import {
  BusinessRuleError,
  isBusinessRuleError,
  isRehydrationError,
} from "@/core/domain/error";
import { UserId } from "@/core/domain/identity/valueObject";
import { MediaAsset, type PendingMedia } from "../entity";
import { MediaErrorCode } from "../errorCode";
import type { MediaAssetId, MediaKind } from "../valueObject";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

const ID_BASE = "00000000-0000-7000-8000-";
const idOf = (n: number): string =>
  `${ID_BASE}${n.toString(16).padStart(12, "0")}`;
const userId = (n: number): UserId =>
  UserId.create(`user-${n.toString(16).padStart(4, "0")}`);

type CreateOpts = {
  id?: number;
  owner?: number;
  kind?: MediaKind;
  mimeType?: string;
  byteSize?: number;
  storageKey?: string;
  originalFileName?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  now?: Date;
};

const createPending = (opts: CreateOpts = {}) =>
  MediaAsset.create(
    {
      id: idOf(opts.id ?? 1),
      ownerId: userId(opts.owner ?? 1),
      kind: opts.kind ?? "image",
      mimeType: opts.mimeType ?? "image/png",
      byteSize: opts.byteSize ?? 1_024,
      storageKey:
        opts.storageKey ??
        `${userId(opts.owner ?? 1)}/image/${idOf(opts.id ?? 1)}`,
      originalFileName: opts.originalFileName ?? null,
      width: opts.width ?? null,
      height: opts.height ?? null,
      durationMs: opts.durationMs ?? null,
    },
    opts.now ?? T0,
  );

describe("MediaAsset.create", () => {
  it("produces a pending entity with refCount=0 and a single media.created draft", () => {
    const { entity, eventDrafts } = createPending({
      id: 1,
      owner: 1,
      now: at(5),
    });
    expect(entity.status).toBe("pending");
    expect(entity.refCount).toBe(0);
    expect(entity.createdAt.getTime()).toBe(at(5).getTime());
    expect(entity.updatedAt.getTime()).toBe(at(5).getTime());
    expect(entity.backend).toBe("r2");

    expect(eventDrafts).toHaveLength(1);
    const draft = eventDrafts[0];
    if (!draft || draft.type !== "media.created") {
      expect.fail("expected media.created event");
      return;
    }
    expect(draft.payload.mediaAssetId).toBe(entity.id);
    expect(draft.payload.ownerId).toBe(entity.ownerId);
    expect(draft.aggregateId).toBe(entity.id);
    expect(draft.occurredAt.getTime()).toBe(at(5).getTime());
  });

  it("validates byteSize / mimeType / storageKey at construction", () => {
    expect(() => createPending({ byteSize: -1 })).toThrow(BusinessRuleError);
    expect(() => createPending({ mimeType: "not-a-mime" })).toThrow(
      BusinessRuleError,
    );
    expect(() => createPending({ storageKey: "   " })).toThrow(
      BusinessRuleError,
    );
  });

  it("validates optional dimension / duration when supplied", () => {
    expect(() => createPending({ width: 0 })).toThrow(BusinessRuleError);
    expect(() => createPending({ durationMs: -1 })).toThrow(BusinessRuleError);
  });
});

describe("MediaAsset.markAttached", () => {
  it("transitions pending → attached with refCount=1 and emits media.attached", () => {
    const { entity: pending } = createPending();
    const { entity: attached, eventDrafts } = MediaAsset.markAttached(
      pending,
      at(10),
    );
    expect(attached.status).toBe("attached");
    expect(attached.refCount).toBe(1);
    expect(attached.updatedAt.getTime()).toBe(at(10).getTime());

    expect(eventDrafts).toHaveLength(1);
    const draft = eventDrafts[0];
    if (!draft || draft.type !== "media.attached") {
      expect.fail("expected media.attached event");
      return;
    }
    expect(draft.payload.mediaAssetId).toBe(attached.id);
  });
});

describe("MediaAsset.incrementRef", () => {
  it("pending → attached emits media.attached", () => {
    const { entity: pending } = createPending();
    const { entity: next, eventDrafts } = MediaAsset.incrementRef(
      pending,
      at(1),
    );
    expect(next.status).toBe("attached");
    expect(next.refCount).toBe(1);
    expect(eventDrafts).toHaveLength(1);
    expect(eventDrafts[0]?.type).toBe("media.attached");
  });

  it("attached → attached(refCount+1) emits no event (internal counter)", () => {
    const { entity: pending } = createPending();
    const { entity: attached } = MediaAsset.incrementRef(pending, at(1));
    const { entity: next, eventDrafts } = MediaAsset.incrementRef(
      attached,
      at(2),
    );
    expect(next.status).toBe("attached");
    expect(next.refCount).toBe(2);
    expect(eventDrafts).toHaveLength(0);
  });
});

describe("MediaAsset.decrementRef", () => {
  it("pending → orphan (abandoned intake) and emits media.orphaned", () => {
    const { entity: pending } = createPending();
    const { entity: next, eventDrafts } = MediaAsset.decrementRef(
      pending,
      at(3),
    );
    expect(next.status).toBe("orphan");
    expect(next.refCount).toBe(0);
    expect(next.updatedAt.getTime()).toBe(at(3).getTime());
    expect(eventDrafts).toHaveLength(1);
    expect(eventDrafts[0]?.type).toBe("media.orphaned");
  });

  it("attached → orphan when refCount drops to 0 and emits media.orphaned", () => {
    const { entity: pending } = createPending();
    const { entity: attached } = MediaAsset.incrementRef(pending, at(1));
    const { entity: next, eventDrafts } = MediaAsset.decrementRef(
      attached,
      at(2),
    );
    expect(next.status).toBe("orphan");
    expect(next.refCount).toBe(0);
    expect(eventDrafts).toHaveLength(1);
    expect(eventDrafts[0]?.type).toBe("media.orphaned");
  });

  it("attached(refCount=2) → attached(refCount=1) emits no event", () => {
    const { entity: pending } = createPending();
    const { entity: refOne } = MediaAsset.incrementRef(pending, at(1));
    const { entity: refTwo } = MediaAsset.incrementRef(refOne, at(2));
    const { entity: next, eventDrafts } = MediaAsset.decrementRef(
      refTwo,
      at(3),
    );
    expect(next.status).toBe("attached");
    if (next.status !== "attached") return;
    expect(next.refCount).toBe(1);
    expect(eventDrafts).toHaveLength(0);
  });

  it("throws StatusRefCountMismatch when attached has non-positive refCount", () => {
    // Construct an illegal attached state via reconstruct's bypass... but
    // `reconstruct` itself rejects refCount<1 for attached. Build the
    // pathological shape manually to assert the runtime guard in
    // `decrementRef` rather than the rehydration guard.
    const { entity: pending } = createPending();
    const broken = {
      ...pending,
      status: "attached" as const,
      refCount: 0,
    } as unknown as Parameters<typeof MediaAsset.decrementRef>[0];
    try {
      MediaAsset.decrementRef(broken, at(1));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(MediaErrorCode.InvariantStatusRefCountMismatch);
      }
    }
  });
});

describe("MediaAsset.markDeleting", () => {
  it("orphan → deleting emits media.deleting", () => {
    const { entity: pending } = createPending();
    const { entity: orphan } = MediaAsset.decrementRef(pending, at(1));
    if (orphan.status !== "orphan") {
      expect.fail("expected orphan");
      return;
    }
    const { entity: next, eventDrafts } = MediaAsset.markDeleting(
      orphan,
      at(2),
    );
    expect(next.status).toBe("deleting");
    expect(next.refCount).toBe(0);
    expect(next.updatedAt.getTime()).toBe(at(2).getTime());
    expect(eventDrafts).toHaveLength(1);
    expect(eventDrafts[0]?.type).toBe("media.deleting");
  });
});

describe("MediaAsset.assertOwnedBy", () => {
  it("returns silently when ownerId matches", () => {
    const { entity } = createPending({ owner: 7 });
    expect(() => MediaAsset.assertOwnedBy(entity, userId(7))).not.toThrow();
  });

  it("throws NotOwned with a stable code when ownerId differs", () => {
    const { entity } = createPending({ owner: 7 });
    try {
      MediaAsset.assertOwnedBy(entity, userId(8));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(MediaErrorCode.NotOwned);
      }
    }
  });
});

describe("MediaAsset type guards", () => {
  it("narrow correctly across the lifecycle", () => {
    const { entity: pending } = createPending();
    expect(MediaAsset.isPending(pending)).toBe(true);
    expect(MediaAsset.isAttached(pending)).toBe(false);

    const { entity: attached } = MediaAsset.incrementRef(pending, at(1));
    expect(MediaAsset.isAttached(attached)).toBe(true);

    const { entity: orphan } = MediaAsset.decrementRef(attached, at(2));
    expect(MediaAsset.isOrphan(orphan)).toBe(true);
    if (orphan.status !== "orphan") return;

    const { entity: deleting } = MediaAsset.markDeleting(orphan, at(3));
    expect(MediaAsset.isDeleting(deleting)).toBe(true);
  });
});

describe("MediaAsset.reconstruct", () => {
  const validRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: idOf(100),
    ownerId: userId(1) as unknown as string,
    kind: "image",
    mimeType: "image/png",
    byteSize: 1_024,
    backend: "r2",
    storageKey: "u/i/x",
    originalFileName: null,
    width: null,
    height: null,
    durationMs: null,
    refCount: 0,
    status: "pending",
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  });

  it("rebuilds a pending entity from a valid row", () => {
    const asset = MediaAsset.reconstruct(validRow());
    expect(asset.status).toBe("pending");
    expect(asset.refCount).toBe(0);
  });

  it("rebuilds an attached entity with refCount>=1", () => {
    const asset = MediaAsset.reconstruct(
      validRow({ status: "attached", refCount: 3 }),
    );
    expect(asset.status).toBe("attached");
    if (asset.status !== "attached") return;
    expect(asset.refCount).toBe(3);
  });

  it("throws RehydrationError for an invalid stored mimeType", () => {
    try {
      MediaAsset.reconstruct(validRow({ mimeType: "not-a-mime" }));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when stored status is unknown", () => {
    try {
      MediaAsset.reconstruct(validRow({ status: "archived" }));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError for pending with refCount != 0", () => {
    try {
      MediaAsset.reconstruct(validRow({ status: "pending", refCount: 1 }));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
      if (isRehydrationError(error)) {
        expect(isBusinessRuleError(error.cause)).toBe(true);
      }
    }
  });

  it("throws RehydrationError for attached with refCount < 1", () => {
    try {
      MediaAsset.reconstruct(validRow({ status: "attached", refCount: 0 }));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError for orphan with refCount != 0", () => {
    try {
      MediaAsset.reconstruct(validRow({ status: "orphan", refCount: 2 }));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError for deleting with refCount != 0", () => {
    try {
      MediaAsset.reconstruct(validRow({ status: "deleting", refCount: 1 }));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError for negative refCount", () => {
    try {
      MediaAsset.reconstruct(validRow({ refCount: -1 }));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });
});

// Surface a typed reference so the unused-export check is satisfied.
const _typedPending: PendingMedia | null = null;
void _typedPending;
void ({} as MediaAssetId);
