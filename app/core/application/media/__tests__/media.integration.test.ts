import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import {
  setupTestContainer,
  type TestContainer,
} from "@/core/application/__tests__/helpers";
import { EventId } from "@/core/domain/common/event";
import { isBusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { MediaErrorCode } from "@/core/domain/media/errorCode";
import {
  type ObjectStorage,
  StorageNotFoundError,
  StorageUnavailableError,
} from "@/core/domain/media/ports/objectStorage";
import type { MediaAssetId, MediaKind } from "@/core/domain/media/valueObject";
import { NoteEvents, type NotePurgedEvent } from "@/core/domain/note/events";
import { type NoteId, NoteTitle } from "@/core/domain/note/valueObject";
import {
  type PublicationVisibility,
  ShareLinkId,
} from "@/core/domain/publication/valueObject";
import { isSystemError, SystemErrorCode } from "../../errors";
import { attachMediaToNote } from "../attachMediaToNote";
import { detachMediaFromNote } from "../detachMediaFromNote";
import { downloadMedia } from "../downloadMedia";
import { finalizeUpload } from "../finalizeUpload";
import { handleNotePurgedEvent } from "../handleNotePurgedEvent";
import { listMediaByOwner } from "../listMediaByOwner";
import { uploadMedia } from "../uploadMedia";
import { uploadMediaPresigned } from "../uploadMediaPresigned";

// spec: spec/testcases/media/index.md
//
// Integration tests for the Media application services. The integration
// harness (`app/core/adapters/d1/__tests__/setup.ts`) truncates all
// owner-scoped tables between tests; we only need to mint fresh user /
// note rows per case and tear nothing down explicitly.

const BASE_TIME = new Date("2026-04-01T00:00:00.000Z");
const TZ = BASE_TIME.toISOString();

let userSeq = 0;
let noteSeq = 0;
let dirSeq = 0;
let mediaSeq = 0;

function nextUserId(): UserId {
  userSeq += 1;
  return `019d0000-0000-7000-8000-${userSeq.toString(16).padStart(12, "0")}` as UserId;
}

function nextNoteId(): NoteId {
  noteSeq += 1;
  return `019d1000-0000-7000-8000-${noteSeq.toString(16).padStart(12, "0")}` as NoteId;
}

function nextDirectoryId(): string {
  dirSeq += 1;
  return `019d2000-0000-7000-8000-${dirSeq.toString(16).padStart(12, "0")}`;
}

function nextMediaId(): MediaAssetId {
  mediaSeq += 1;
  return `019d3000-0000-7000-8000-${mediaSeq.toString(16).padStart(12, "0")}` as MediaAssetId;
}

async function seedUser(
  container: TestContainer,
  id: UserId = nextUserId(),
): Promise<UserId> {
  const suffix = id.slice(-12);
  await container.db.insert(schema.users).values({
    id: id as unknown as string,
    name: `user-${suffix}`,
    email: `user-${suffix}@example.test`,
    emailVerified: 1,
    username: `user_${suffix}`,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

async function seedDirectory(
  container: TestContainer,
  ownerId: UserId,
): Promise<string> {
  const id = nextDirectoryId();
  await container.db.insert(schema.directories).values({
    id,
    ownerId: ownerId as unknown as string,
    parentId: null,
    name: "root",
    slug: `root-${id.slice(-6)}`,
    depth: 0,
    version: 0,
    createdAt: TZ,
    updatedAt: TZ,
  });
  return id;
}

async function seedNote(
  container: TestContainer,
  ownerId: UserId,
  directoryId: string,
): Promise<NoteId> {
  const id = nextNoteId();
  await container.db.insert(schema.notes).values({
    id: id as unknown as string,
    ownerId: ownerId as unknown as string,
    directoryId,
    slug: `n-${id.slice(-6)}`,
    title: "note",
    contentHtml: "<p>body</p>",
    frontMatterJson: "{}",
    status: "active",
    trashedAt: null,
    createdAt: TZ,
    updatedAt: TZ,
    editLockUserId: null,
    editLockAcquiredAt: null,
    editLockExpiresAt: null,
    version: 0,
  });
  return id;
}

async function seedPublicationState(
  container: TestContainer,
  noteId: NoteId,
  ownerId: UserId,
  visibility: PublicationVisibility,
): Promise<void> {
  await container.db.insert(schema.publicationStates).values({
    noteId: noteId as unknown as string,
    ownerId: ownerId as unknown as string,
    visibility,
    publishedAt: visibility === "public" ? TZ : null,
    updatedAt: TZ,
    version: 0,
  });
}

type MediaSeedOptions = Readonly<{
  id?: MediaAssetId;
  ownerId: UserId;
  kind?: MediaKind;
  status?: "pending" | "attached" | "orphan" | "deleting";
  refCount?: number;
  byteSize?: number;
  mimeType?: string;
  storageKey?: string;
  originalFileName?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}>;

async function seedMedia(
  container: TestContainer,
  opts: MediaSeedOptions,
): Promise<MediaAssetId> {
  const id = opts.id ?? nextMediaId();
  const kind: MediaKind = opts.kind ?? "image";
  const status = opts.status ?? "pending";
  const refCount = opts.refCount ?? (status === "attached" ? 1 : 0);
  await container.db.insert(schema.mediaAssets).values({
    id: id as unknown as string,
    ownerId: opts.ownerId as unknown as string,
    kind,
    mimeType: opts.mimeType ?? "image/png",
    byteSize: opts.byteSize ?? 1024,
    backend: "r2",
    storageKey: opts.storageKey ?? `${opts.ownerId}/${kind}/${id}`,
    originalFileName: opts.originalFileName ?? null,
    width: null,
    height: null,
    durationMs: null,
    refCount,
    status,
    createdAt: (opts.createdAt ?? BASE_TIME).toISOString(),
    updatedAt: (opts.updatedAt ?? BASE_TIME).toISOString(),
  });
  return id;
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

type MediaAssetRow = typeof schema.mediaAssets.$inferSelect;

async function fetchMediaRow(
  container: TestContainer,
  id: MediaAssetId,
): Promise<MediaAssetRow | undefined> {
  const rows = await container.db
    .select()
    .from(schema.mediaAssets)
    .where(eq(schema.mediaAssets.id, id as unknown as string));
  return rows[0];
}

describe("uploadMedia (integration)", () => {
  // spec: spec/testcases/media/index.md#UploadMedia
  const getContainer = setupTestContainer();

  it("persists a pending MediaAsset and returns a download URL for a normal image", async () => {
    const container = getContainer();
    const ownerId = await seedUser(container);

    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { mediaId, downloadUrl } = await uploadMedia({
      container,
      input: {
        actorUserId: ownerId,
        kind: "image",
        mimeType: "image/png",
        byteSize: bytes.byteLength,
        bodyStream: streamOf(bytes),
        originalFileName: "pic.png",
      },
    });

    expect(downloadUrl).toBeInstanceOf(URL);
    const row = await fetchMediaRow(container, mediaId as MediaAssetId);
    expect(row).toBeDefined();
    expect(row?.status).toBe("pending");
    expect(row?.refCount).toBe(0);
    expect(row?.byteSize).toBe(bytes.byteLength);
    expect(row?.ownerId).toBe(ownerId);
  });

  it("throws BusinessRuleError(ByteSizeExceeded) when the upload exceeds the per-asset limit", async () => {
    // ADR-004 #2: spec describes this as `ValidationError`, implementation
    // raises `BusinessRuleError(MediaErrorCode.ByteSizeExceeded)`. Tested
    // here against the implementation; spec text is to be aligned in a
    // follow-up Issue.
    const container = getContainer();
    const ownerId = await seedUser(container);
    const oversized = new Uint8Array(1_048_576 + 1);

    try {
      await uploadMedia({
        container,
        input: {
          actorUserId: ownerId,
          kind: "image",
          mimeType: "image/png",
          byteSize: oversized.byteLength,
          bodyStream: streamOf(oversized),
          originalFileName: null,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(MediaErrorCode.ByteSizeExceeded);
      } else {
        throw error;
      }
    }

    const rows = await container.db.select().from(schema.mediaAssets);
    expect(rows).toHaveLength(0);
  });

  it("throws SystemError(ExternalApiError) and leaves no DB row when storage put fails", async () => {
    // ADR-004 #3: spec describes this as `StorageUnavailableError`;
    // implementation wraps the storage exception in
    // `SystemError(SystemErrorCode.ExternalApiError)` via `safeStoragePut`.
    const container = getContainer();
    const ownerId = await seedUser(container);
    const storage = new ThrowingObjectStoragePut(container.objectStorage);
    const customised: TestContainer = { ...container, objectStorage: storage };

    const bytes = new Uint8Array([9, 9, 9]);
    try {
      await uploadMedia({
        container: customised,
        input: {
          actorUserId: ownerId,
          kind: "image",
          mimeType: "image/png",
          byteSize: bytes.byteLength,
          bodyStream: streamOf(bytes),
          originalFileName: null,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (isSystemError(error)) {
        expect(error.code).toBe(SystemErrorCode.ExternalApiError);
      } else {
        throw error;
      }
    }

    const rows = await container.db.select().from(schema.mediaAssets);
    expect(rows).toHaveLength(0);
  });
});

describe("uploadMediaPresigned (integration)", () => {
  // spec: spec/testcases/media/index.md#UploadMediaPresigned-FinalizeUpload
  const getContainer = setupTestContainer();

  it("pre-creates a pending Asset and returns an upload URL", async () => {
    const container = getContainer();
    const ownerId = await seedUser(container);

    const { mediaId, uploadUrl, expectedDownloadUrl } =
      await uploadMediaPresigned({
        container,
        input: {
          actorUserId: ownerId,
          kind: "image",
          mimeType: "image/png",
          byteSize: 512,
        },
      });

    expect(uploadUrl).toBeInstanceOf(URL);
    expect(expectedDownloadUrl).toBeInstanceOf(URL);
    const row = await fetchMediaRow(container, mediaId as MediaAssetId);
    expect(row?.status).toBe("pending");
    expect(row?.refCount).toBe(0);
    expect(row?.byteSize).toBe(512);
  });
});

describe("finalizeUpload (integration)", () => {
  // spec: spec/testcases/media/index.md#UploadMediaPresigned-FinalizeUpload
  const getContainer = setupTestContainer();

  it("reflects size/mime onto the Asset when the storage object exists", async () => {
    const container = getContainer();
    const ownerId = await seedUser(container);
    const { mediaId } = await uploadMediaPresigned({
      container,
      input: {
        actorUserId: ownerId,
        kind: "image",
        mimeType: "image/png",
        byteSize: 256,
      },
    });
    // Simulate the client PUT by writing bytes directly into the in-memory
    // storage at the expected key.
    const row = await fetchMediaRow(container, mediaId as MediaAssetId);
    if (row === undefined) throw new Error("seed precondition failed");
    const realBytes = new Uint8Array(900);
    await container.objectStorage.put(
      row.storageKey,
      realBytes.buffer,
      "image/jpeg",
    );

    const result = await finalizeUpload({
      container,
      input: { actorUserId: ownerId, mediaId: mediaId as MediaAssetId },
    });

    expect(result.byteSize).toBe(realBytes.byteLength);
    expect(result.mimeType).toBe("image/jpeg");
    const updated = await fetchMediaRow(container, mediaId as MediaAssetId);
    expect(updated?.byteSize).toBe(realBytes.byteLength);
    expect(updated?.mimeType).toBe("image/jpeg");
  });

  it("throws SystemError(DataIntegrityError) when the storage object is missing", async () => {
    // The shared `InMemoryObjectStorage` raises a plain `Error` for
    // missing keys, which `safeStat` does not map. Replacing it with the
    // typed-error stub exercises the documented
    // `StorageNotFoundError → SystemError(DataIntegrityError)` mapping.
    const base = getContainer();
    const ownerId = await seedUser(base);
    const { mediaId } = await uploadMediaPresigned({
      container: base,
      input: {
        actorUserId: ownerId,
        kind: "image",
        mimeType: "image/png",
        byteSize: 256,
      },
    });
    const container: TestContainer = {
      ...base,
      objectStorage: new ThrowingObjectStorageStat(base.objectStorage),
    };

    try {
      await finalizeUpload({
        container,
        input: { actorUserId: ownerId, mediaId: mediaId as MediaAssetId },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (isSystemError(error)) {
        expect(error.code).toBe(SystemErrorCode.DataIntegrityError);
      } else {
        throw error;
      }
    }
  });
});

describe("attachMediaToNote (integration)", () => {
  // spec: spec/testcases/media/index.md#AttachMediaToNote-DetachMediaFromNote
  const getContainer = setupTestContainer();

  it("increments refCount and transitions pending→attached when a note references the asset", async () => {
    const container = getContainer();
    const ownerId = await seedUser(container);
    const mediaId = await seedMedia(container, { ownerId, status: "pending" });

    await attachMediaToNote({
      container,
      input: { noteBeforeIds: [], noteAfterIds: [mediaId] },
    });

    const row = await fetchMediaRow(container, mediaId);
    expect(row?.status).toBe("attached");
    expect(row?.refCount).toBe(1);
  });
});

describe("detachMediaFromNote (integration)", () => {
  // spec: spec/testcases/media/index.md#AttachMediaToNote-DetachMediaFromNote
  const getContainer = setupTestContainer();

  it("decrements refCount and orphans the asset when the last reference goes away", async () => {
    const container = getContainer();
    const ownerId = await seedUser(container);
    const mediaId = await seedMedia(container, {
      ownerId,
      status: "attached",
      refCount: 1,
    });

    await detachMediaFromNote({
      container,
      input: { noteBeforeIds: [mediaId] },
    });

    const row = await fetchMediaRow(container, mediaId);
    expect(row?.status).toBe("orphan");
    expect(row?.refCount).toBe(0);
  });
});

describe("listMediaByOwner (integration)", () => {
  // spec: spec/testcases/media/index.md#ListMediaByOwner
  const getContainer = setupTestContainer();

  it("returns only the actor's own media assets", async () => {
    const container = getContainer();
    const ownerId = await seedUser(container);
    const otherId = await seedUser(container);
    const mine1 = await seedMedia(container, {
      ownerId,
      createdAt: new Date(BASE_TIME.getTime() + 1_000),
    });
    const mine2 = await seedMedia(container, {
      ownerId,
      createdAt: new Date(BASE_TIME.getTime() + 2_000),
    });
    await seedMedia(container, { ownerId: otherId });

    const { assets, nextCursor } = await listMediaByOwner({
      container,
      input: { actorUserId: ownerId, limit: 50, cursor: null },
    });

    expect(nextCursor).toBeNull();
    const ids = new Set(assets.map((a) => a.id as unknown as string));
    expect(ids.has(mine1 as unknown as string)).toBe(true);
    expect(ids.has(mine2 as unknown as string)).toBe(true);
    expect(assets).toHaveLength(2);
  });
});

describe("downloadMedia (integration)", () => {
  // spec: spec/testcases/media/index.md#DownloadMedia
  const getContainer = setupTestContainer();

  it("returns a redirect URL when the viewer is the owner", async () => {
    const container = getContainer();
    const ownerId = await seedUser(container);
    const mediaId = await seedMedia(container, {
      ownerId,
      status: "attached",
      refCount: 1,
    });

    const { redirectUrl } = await downloadMedia({
      container,
      input: {
        viewerUserId: ownerId,
        mediaId,
        viaShareLinkId: null,
        relatedNoteId: null,
      },
    });
    expect(redirectUrl).toBeInstanceOf(URL);
  });

  it("returns a redirect URL for another viewer when the related note is public", async () => {
    const container = getContainer();
    const ownerId = await seedUser(container);
    const viewerId = await seedUser(container);
    const dir = await seedDirectory(container, ownerId);
    const noteId = await seedNote(container, ownerId, dir);
    await seedPublicationState(container, noteId, ownerId, "public");
    const mediaId = await seedMedia(container, {
      ownerId,
      status: "attached",
      refCount: 1,
    });

    const { redirectUrl } = await downloadMedia({
      container,
      input: {
        viewerUserId: viewerId,
        mediaId,
        viaShareLinkId: null,
        relatedNoteId: noteId,
      },
    });
    expect(redirectUrl).toBeInstanceOf(URL);
  });

  it("throws BusinessRuleError(NotViewable) for another viewer when the related note is private", async () => {
    const container = getContainer();
    const ownerId = await seedUser(container);
    const viewerId = await seedUser(container);
    const dir = await seedDirectory(container, ownerId);
    const noteId = await seedNote(container, ownerId, dir);
    await seedPublicationState(container, noteId, ownerId, "private");
    const mediaId = await seedMedia(container, {
      ownerId,
      status: "attached",
      refCount: 1,
    });

    try {
      await downloadMedia({
        container,
        input: {
          viewerUserId: viewerId,
          mediaId,
          viaShareLinkId: null,
          relatedNoteId: noteId,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(MediaErrorCode.NotViewable);
      } else {
        throw error;
      }
    }
  });

  it("returns a redirect URL for another viewer when the related note is unlisted and viaShareLinkId was passed", async () => {
    const container = getContainer();
    const ownerId = await seedUser(container);
    const viewerId = await seedUser(container);
    const dir = await seedDirectory(container, ownerId);
    const noteId = await seedNote(container, ownerId, dir);
    await seedPublicationState(container, noteId, ownerId, "unlisted");
    const mediaId = await seedMedia(container, {
      ownerId,
      status: "attached",
      refCount: 1,
    });

    const { redirectUrl } = await downloadMedia({
      container,
      input: {
        viewerUserId: viewerId,
        mediaId,
        viaShareLinkId: ShareLinkId.create(
          "019d6000-0000-7000-8000-000000000001",
        ),
        relatedNoteId: noteId,
      },
    });
    expect(redirectUrl).toBeInstanceOf(URL);
  });

  // Issue #42: downloadMedia now enforces that unlisted notes require a
  // share-link out-of-band. Mirror of the previous "unlisted +
  // viaShareLinkId 有" case but with viaShareLinkId=null.
  it("throws BusinessRuleError(media_not_viewable) for another viewer when the related note is unlisted and viaShareLinkId was not supplied", async () => {
    const container = getContainer();
    const ownerId = await seedUser(container);
    const viewerId = await seedUser(container);
    const dir = await seedDirectory(container, ownerId);
    const noteId = await seedNote(container, ownerId, dir);
    await seedPublicationState(container, noteId, ownerId, "unlisted");
    const mediaId = await seedMedia(container, {
      ownerId,
      status: "attached",
      refCount: 1,
    });

    try {
      await downloadMedia({
        container,
        input: {
          viewerUserId: viewerId,
          mediaId,
          viaShareLinkId: null,
          relatedNoteId: noteId,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(MediaErrorCode.NotViewable);
      } else {
        throw error;
      }
    }
  });

  // Issue #452: source-kind assets are owner-only (called with
  // relatedNoteId=null). The owner can download; another viewer cannot.
  it("authorises a source-kind asset for its owner and presigns an attachment when download=true", async () => {
    const container = getContainer();
    const ownerId = await seedUser(container);
    const mediaId = await seedMedia(container, {
      ownerId,
      kind: "source",
      status: "attached",
      refCount: 1,
      mimeType: "application/pdf",
      originalFileName: "report.pdf",
    });

    const { redirectUrl } = await downloadMedia({
      container,
      input: {
        viewerUserId: ownerId,
        mediaId,
        viaShareLinkId: null,
        relatedNoteId: null,
        download: true,
      },
    });
    expect(redirectUrl).toBeInstanceOf(URL);
    expect(
      redirectUrl.searchParams.get("response-content-disposition"),
    ).toContain("report.pdf");
  });

  it("rejects a source-kind asset for a non-owner viewer", async () => {
    const container = getContainer();
    const ownerId = await seedUser(container);
    const viewerId = await seedUser(container);
    const mediaId = await seedMedia(container, {
      ownerId,
      kind: "source",
      status: "attached",
      refCount: 1,
    });

    try {
      await downloadMedia({
        container,
        input: {
          viewerUserId: viewerId,
          mediaId,
          viaShareLinkId: null,
          relatedNoteId: null,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(MediaErrorCode.NotViewable);
      } else {
        throw error;
      }
    }
  });
});

describe("handleNotePurgedEvent (integration)", () => {
  // spec: spec/testcases/media/index.md#HandleNotePurgedEvent
  const getContainer = setupTestContainer();

  it("releases references and orphans an attached asset when a note purge event arrives", async () => {
    const container = getContainer();
    const ownerId = await seedUser(container);
    const dir = await seedDirectory(container, ownerId);
    const noteId = await seedNote(container, ownerId, dir);
    const mediaId = await seedMedia(container, {
      ownerId,
      status: "attached",
      refCount: 1,
    });
    const event = buildNotePurgedEvent({
      noteId,
      ownerId,
      mediaRefs: [mediaId],
    });

    await handleNotePurgedEvent({ container, input: { event } });

    const row = await fetchMediaRow(container, mediaId);
    expect(row?.status).toBe("orphan");
    expect(row?.refCount).toBe(0);
  });

  it("is idempotent: a duplicate event keeps an already-orphaned asset unchanged", async () => {
    // Once the asset is in `orphan` status, `MediaService.reconcileRefs`
    // short-circuits before touching it again — covering the at-least-once
    // outbox delivery contract.
    const container = getContainer();
    const ownerId = await seedUser(container);
    const dir = await seedDirectory(container, ownerId);
    const noteId = await seedNote(container, ownerId, dir);
    const mediaId = await seedMedia(container, {
      ownerId,
      status: "attached",
      refCount: 1,
    });
    const event = buildNotePurgedEvent({
      noteId,
      ownerId,
      mediaRefs: [mediaId],
    });

    await handleNotePurgedEvent({ container, input: { event } });
    const first = await fetchMediaRow(container, mediaId);
    const firstUpdatedAt = first?.updatedAt;
    expect(first?.status).toBe("orphan");
    expect(first?.refCount).toBe(0);

    await handleNotePurgedEvent({ container, input: { event } });
    const second = await fetchMediaRow(container, mediaId);
    expect(second?.status).toBe("orphan");
    expect(second?.refCount).toBe(0);
    // `updatedAt` must not advance — proves no second decrement ran.
    expect(second?.updatedAt).toBe(firstUpdatedAt);
  });
});

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function buildNotePurgedEvent(params: {
  noteId: NoteId;
  ownerId: UserId;
  mediaRefs: readonly MediaAssetId[];
  sourceFileId?: MediaAssetId | null;
}): NotePurgedEvent {
  const draft = NoteEvents.purged(
    {
      noteId: params.noteId,
      ownerId: params.ownerId,
      title: NoteTitle.create("Purged"),
      mediaRefs: params.mediaRefs,
      sourceFileId: params.sourceFileId ?? null,
    },
    BASE_TIME,
  );
  return {
    ...draft,
    id: EventId.create("019d9000-0000-7000-8000-000000000001"),
  };
}

/**
 * Wraps an `ObjectStorage` and rewrites its `put` to throw the typed
 * `StorageUnavailableError`, so `uploadMedia` exercises the
 * `safeStoragePut → SystemError(ExternalApiError)` mapping. All other
 * methods delegate to the wrapped storage.
 */
class ThrowingObjectStoragePut implements ObjectStorage {
  constructor(private readonly inner: ObjectStorage) {}
  async put(): Promise<void> {
    throw new StorageUnavailableError("simulated R2 outage");
  }
  get(key: string) {
    return this.inner.get(key);
  }
  stat(key: string) {
    return this.inner.stat(key);
  }
  delete(key: string) {
    return this.inner.delete(key);
  }
  presignDownload(key: string, ttlSec: number) {
    return this.inner.presignDownload(key, ttlSec);
  }
  presignUpload(key: string, contentType: string, ttlSec: number) {
    return this.inner.presignUpload(key, contentType, ttlSec);
  }
}

/**
 * Wraps an `ObjectStorage` and rewrites its `stat` to throw the typed
 * `StorageNotFoundError`, so `finalizeUpload` exercises the documented
 * mapping into `SystemError(DataIntegrityError)`.
 */
class ThrowingObjectStorageStat implements ObjectStorage {
  constructor(private readonly inner: ObjectStorage) {}
  put(key: string, bytes: ArrayBuffer, contentType: string) {
    return this.inner.put(key, bytes, contentType);
  }
  get(key: string) {
    return this.inner.get(key);
  }
  async stat(): Promise<never> {
    throw new StorageNotFoundError("simulated missing object");
  }
  delete(key: string) {
    return this.inner.delete(key);
  }
  presignDownload(key: string, ttlSec: number) {
    return this.inner.presignDownload(key, ttlSec);
  }
  presignUpload(key: string, contentType: string, ttlSec: number) {
    return this.inner.presignUpload(key, contentType, ttlSec);
  }
}
