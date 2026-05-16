import { describe, expect, it } from "vitest";
import { isBusinessRuleError, isRehydrationError } from "@/core/domain/error";
import type { MediaAssetId, UserId } from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import { PublicationState, ShareLink } from "../entity";
import { PublicationErrorCode } from "../errorCode";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

const NOTE_ID_BASE = "00000000-0000-7000-8000-";
const noteId = (n: number): NoteId =>
  NoteId.create(`${NOTE_ID_BASE}${n.toString(16).padStart(12, "0")}`);

const SHARE_LINK_ID_BASE = "00000000-0000-7000-9000-";
const shareLinkRawId = (n: number): string =>
  `${SHARE_LINK_ID_BASE}${n.toString(16).padStart(12, "0")}`;

const OWNER_ID = "00000000-0000-7000-a000-000000000001" as UserId;
const TOKEN_HASH_1 = "0123456789abcdef0123456789abcdef";

const mediaId = (n: number): MediaAssetId =>
  `media-${n.toString(16).padStart(12, "0")}` as MediaAssetId;

describe("PublicationState.create", () => {
  it("starts in private visibility with no publishedAt", () => {
    const state = PublicationState.create(
      { noteId: noteId(1), ownerId: OWNER_ID },
      T0,
    );
    expect(state.visibility).toBe("private");
    expect(state.publishedAt).toBeNull();
    expect(state.version).toBe(0);
    expect(state.updatedAt.getTime()).toBe(T0.getTime());
  });
});

describe("PublicationState.changeVisibility", () => {
  it("private -> public sets publishedAt to `now` and emits note.publish_changed", () => {
    const state = PublicationState.create(
      { noteId: noteId(2), ownerId: OWNER_ID },
      T0,
    );
    const { entity: next, eventDrafts } = PublicationState.changeVisibility(
      state,
      "public",
      at(10),
    );
    expect(next.visibility).toBe("public");
    expect(next.publishedAt?.getTime()).toBe(at(10).getTime());
    expect(next.version).toBe(state.version + 1);
    expect(eventDrafts).toHaveLength(1);
    const draft = eventDrafts[0];
    if (!draft || draft.type !== "note.publish_changed") {
      expect.fail("expected note.publish_changed event");
      return;
    }
    expect(draft.payload.previous).toBe("private");
    expect(draft.payload.next).toBe("public");
    expect(draft.payload.noteId).toBe(next.noteId);
    expect(draft.payload.ownerId).toBe(next.ownerId);
    expect(draft.aggregateId).toBe(next.noteId);
    expect(draft.occurredAt.getTime()).toBe(at(10).getTime());
  });

  it("public -> private clears publishedAt and emits note.publish_changed", () => {
    const state = PublicationState.create(
      { noteId: noteId(3), ownerId: OWNER_ID },
      T0,
    );
    const { entity: pub } = PublicationState.changeVisibility(
      state,
      "public",
      at(1),
    );
    const { entity: priv, eventDrafts } = PublicationState.changeVisibility(
      pub,
      "private",
      at(2),
    );
    expect(priv.visibility).toBe("private");
    expect(priv.publishedAt).toBeNull();
    expect(priv.version).toBe(pub.version + 1);
    expect(eventDrafts).toHaveLength(1);
  });

  it("unlisted -> public re-stamps publishedAt to the latest `now`", () => {
    const state = PublicationState.create(
      { noteId: noteId(4), ownerId: OWNER_ID },
      T0,
    );
    const { entity: unlisted } = PublicationState.changeVisibility(
      state,
      "unlisted",
      at(1),
    );
    // Going to unlisted does not set publishedAt by default (preserves
    // whatever was there — still null in this case).
    expect(unlisted.publishedAt).toBeNull();

    const { entity: pub } = PublicationState.changeVisibility(
      unlisted,
      "public",
      at(50),
    );
    expect(pub.publishedAt?.getTime()).toBe(at(50).getTime());
  });

  it("public -> unlisted preserves the existing publishedAt", () => {
    const state = PublicationState.create(
      { noteId: noteId(5), ownerId: OWNER_ID },
      T0,
    );
    const { entity: pub } = PublicationState.changeVisibility(
      state,
      "public",
      at(10),
    );
    const { entity: unl } = PublicationState.changeVisibility(
      pub,
      "unlisted",
      at(20),
    );
    expect(unl.visibility).toBe("unlisted");
    expect(unl.publishedAt?.getTime()).toBe(at(10).getTime());
    expect(unl.version).toBe(pub.version + 1);
  });

  it("is a no-op when the target visibility equals the current one", () => {
    const state = PublicationState.create(
      { noteId: noteId(6), ownerId: OWNER_ID },
      T0,
    );
    const { entity, eventDrafts } = PublicationState.changeVisibility(
      state,
      "private",
      at(100),
    );
    expect(entity).toBe(state);
    expect(eventDrafts).toHaveLength(0);
  });
});

describe("PublicationState.assertCanPublish", () => {
  it("passes when every used media id is owned", () => {
    const used = new Set<MediaAssetId>([mediaId(1), mediaId(2)]);
    const owned = new Set<MediaAssetId>([mediaId(1), mediaId(2), mediaId(3)]);
    expect(() => PublicationState.assertCanPublish(used, owned)).not.toThrow();
  });

  it("passes trivially when the used set is empty", () => {
    expect(() =>
      PublicationState.assertCanPublish(new Set(), new Set([mediaId(1)])),
    ).not.toThrow();
  });

  it("throws BusinessRuleError(MediaNotOwned) when a used id is missing from owned", () => {
    const used = new Set<MediaAssetId>([mediaId(1), mediaId(99)]);
    const owned = new Set<MediaAssetId>([mediaId(1)]);
    try {
      PublicationState.assertCanPublish(used, owned);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(PublicationErrorCode.MediaNotOwned);
      }
    }
  });
});

describe("PublicationState.reconstruct", () => {
  const validRow = () => ({
    noteId: `${NOTE_ID_BASE}${(100).toString(16).padStart(12, "0")}`,
    ownerId: OWNER_ID as string,
    visibility: "public",
    publishedAt: at(5),
    updatedAt: at(6),
    version: 3,
  });

  it("rebuilds a state from a well-formed row", () => {
    const row = validRow();
    const state = PublicationState.reconstruct(row);
    expect(state.visibility).toBe("public");
    expect(state.publishedAt?.getTime()).toBe(at(5).getTime());
    expect(state.version).toBe(3);
  });

  it("throws RehydrationError (not BusinessRuleError) when the invariant private/publishedAt is violated", () => {
    try {
      PublicationState.reconstruct({
        ...validRow(),
        visibility: "private",
        publishedAt: at(5),
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
      expect(isBusinessRuleError(error)).toBe(false);
      if (isRehydrationError(error)) {
        expect(isBusinessRuleError(error.cause)).toBe(true);
      }
    }
  });

  it("throws RehydrationError when the stored visibility is unknown", () => {
    try {
      PublicationState.reconstruct({ ...validRow(), visibility: "draft" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ShareLink
// ---------------------------------------------------------------------------

const newActiveLink = (n: number, password: string | null = null) =>
  ShareLink.create(
    {
      id: shareLinkRawId(n),
      noteId: noteId(n),
      ownerId: OWNER_ID,
      tokenHash: TOKEN_HASH_1,
      passwordHash: password,
    },
    T0,
  );

describe("ShareLink.create", () => {
  it("produces an active link with version 0 and emits share_link.issued", () => {
    const { entity: link, eventDrafts } = newActiveLink(1);
    expect(link.status).toBe("active");
    expect(link.passwordHash).toBeNull();
    expect(link.failedAttempts).toBe(0);
    expect(link.lockedUntil).toBeNull();
    expect(link.version).toBe(0);
    expect(eventDrafts).toHaveLength(1);
    const draft = eventDrafts[0];
    if (!draft || draft.type !== "share_link.issued") {
      expect.fail("expected share_link.issued event");
      return;
    }
    expect(draft.payload.shareLinkId).toBe(link.id);
    expect(draft.payload.noteId).toBe(link.noteId);
    expect(draft.aggregateId).toBe(link.id);
  });
});

describe("ShareLink.revoke", () => {
  it("flips active -> revoked, records revokedAt, bumps version, emits share_link.revoked", () => {
    const { entity: active } = newActiveLink(2);
    const { entity: revoked, eventDrafts } = ShareLink.revoke(active, at(5));
    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedAt.getTime()).toBe(at(5).getTime());
    expect(revoked.version).toBe(active.version + 1);
    expect(eventDrafts).toHaveLength(1);
    const draft = eventDrafts[0];
    if (!draft || draft.type !== "share_link.revoked") {
      expect.fail("expected share_link.revoked event");
      return;
    }
    expect(draft.payload.shareLinkId).toBe(revoked.id);
  });

  it("throws BusinessRuleError(ShareLinkRevoked) when revoking an already-revoked link", () => {
    const { entity: active } = newActiveLink(3);
    const { entity: revoked } = ShareLink.revoke(active, at(1));
    try {
      ShareLink.revoke(revoked, at(2));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(PublicationErrorCode.ShareLinkRevoked);
      }
    }
  });
});

describe("ShareLink.setPassword", () => {
  it("updates the password hash and bumps version on an active link", () => {
    const { entity: active } = newActiveLink(4);
    const updated = ShareLink.setPassword(active, "new-hash", at(1));
    expect(updated.passwordHash).toBe("new-hash");
    expect(updated.version).toBe(active.version + 1);
  });

  it("clears the password when passed null", () => {
    const { entity: active } = newActiveLink(5, "old-hash");
    const updated = ShareLink.setPassword(active, null, at(1));
    expect(updated.passwordHash).toBeNull();
  });

  it("throws BusinessRuleError(ShareLinkRevoked) on a revoked link", () => {
    const { entity: active } = newActiveLink(6);
    const { entity: revoked } = ShareLink.revoke(active, at(1));
    try {
      ShareLink.setPassword(revoked, "anything", at(2));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(PublicationErrorCode.ShareLinkRevoked);
      }
    }
  });
});

describe("ShareLink.recordAccess", () => {
  it("records lastAccessedAt and bumps version", () => {
    const { entity: active } = newActiveLink(7);
    const updated = ShareLink.recordAccess(active, at(50));
    expect(updated.lastAccessedAt?.getTime()).toBe(at(50).getTime());
    expect(updated.version).toBe(active.version + 1);
  });
});

describe("ShareLink.recordFailedAttempt", () => {
  it("increments failedAttempts and does not arm lock until threshold", () => {
    const { entity: active } = newActiveLink(8, "hash");
    const after1 = ShareLink.recordFailedAttempt(active, at(1), 5, 900);
    expect(after1.failedAttempts).toBe(1);
    expect(after1.lockedUntil).toBeNull();
  });

  it("arms lockedUntil exactly when failedAttempts reaches maxAttempts", () => {
    const { entity: link0 } = newActiveLink(9, "hash");
    let link = link0;
    for (let i = 0; i < 4; i++) {
      link = ShareLink.recordFailedAttempt(link, at(1), 5, 900);
    }
    expect(link.failedAttempts).toBe(4);
    expect(link.lockedUntil).toBeNull();
    const locked = ShareLink.recordFailedAttempt(link, at(1000), 5, 900);
    expect(locked.failedAttempts).toBe(5);
    expect(locked.lockedUntil?.getTime()).toBe(at(1000).getTime() + 900 * 1000);
  });
});

describe("ShareLink.resetFailedAttempts", () => {
  it("clears failedAttempts and lockedUntil and bumps version when there is state to clear", () => {
    const { entity: active } = newActiveLink(10, "hash");
    const failed = ShareLink.recordFailedAttempt(active, at(1), 5, 900);
    const reset = ShareLink.resetFailedAttempts(failed, at(2));
    expect(reset.failedAttempts).toBe(0);
    expect(reset.lockedUntil).toBeNull();
    expect(reset.version).toBe(failed.version + 1);
  });

  it("returns the same instance and does not bump version when already clean", () => {
    const { entity: active } = newActiveLink(11);
    const reset = ShareLink.resetFailedAttempts(active, at(99));
    expect(reset).toBe(active);
  });
});

describe("ShareLink.isOpen", () => {
  it("returns true for an active link with no lock", () => {
    const { entity: active } = newActiveLink(12);
    expect(ShareLink.isOpen(active, at(0))).toBe(true);
  });

  it("returns false while lockedUntil is in the future", () => {
    const { entity: active } = newActiveLink(13, "hash");
    let link = active;
    for (let i = 0; i < 5; i++) {
      link = ShareLink.recordFailedAttempt(link, at(0), 5, 900);
    }
    expect(ShareLink.isOpen(link, at(0))).toBe(false);
    expect(ShareLink.isOpen(link, at(900 * 1000 - 1))).toBe(false);
  });

  it("returns true once lockedUntil has passed", () => {
    const { entity: active } = newActiveLink(14, "hash");
    let link = active;
    for (let i = 0; i < 5; i++) {
      link = ShareLink.recordFailedAttempt(link, at(0), 5, 900);
    }
    expect(ShareLink.isOpen(link, at(900 * 1000))).toBe(true);
  });

  it("returns false for a revoked link", () => {
    const { entity: active } = newActiveLink(15);
    const { entity: revoked } = ShareLink.revoke(active, at(1));
    expect(ShareLink.isOpen(revoked, at(2))).toBe(false);
  });
});

describe("ShareLink type guards", () => {
  it("isActive / isRevoked narrow correctly", () => {
    const { entity: active } = newActiveLink(16);
    expect(ShareLink.isActive(active)).toBe(true);
    expect(ShareLink.isRevoked(active)).toBe(false);
    const { entity: revoked } = ShareLink.revoke(active, at(1));
    expect(ShareLink.isActive(revoked)).toBe(false);
    expect(ShareLink.isRevoked(revoked)).toBe(true);
  });
});

describe("ShareLink.reconstruct", () => {
  const validRow = () => ({
    id: shareLinkRawId(200),
    noteId: `${NOTE_ID_BASE}${(200).toString(16).padStart(12, "0")}`,
    ownerId: OWNER_ID as string,
    tokenHash: TOKEN_HASH_1,
    passwordHash: null,
    status: "active",
    createdAt: T0,
    revokedAt: null,
    lastAccessedAt: null,
    failedAttempts: 0,
    lockedUntil: null,
    updatedAt: at(1),
    version: 2,
  });

  it("rebuilds an active link from a well-formed row", () => {
    const link = ShareLink.reconstruct(validRow());
    expect(link.status).toBe("active");
    expect(link.version).toBe(2);
  });

  it("rebuilds a revoked link when status=revoked and revokedAt is set", () => {
    const link = ShareLink.reconstruct({
      ...validRow(),
      status: "revoked",
      revokedAt: at(5),
    });
    expect(link.status).toBe("revoked");
    if (ShareLink.isRevoked(link)) {
      expect(link.revokedAt.getTime()).toBe(at(5).getTime());
    }
  });

  it("throws RehydrationError when status=revoked but revokedAt is null", () => {
    try {
      ShareLink.reconstruct({
        ...validRow(),
        status: "revoked",
        revokedAt: null,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
      expect(isBusinessRuleError(error)).toBe(false);
    }
  });

  it("throws RehydrationError when failedAttempts is negative", () => {
    try {
      ShareLink.reconstruct({ ...validRow(), failedAttempts: -1 });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when status is unknown", () => {
    try {
      ShareLink.reconstruct({ ...validRow(), status: "expired" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });
});
