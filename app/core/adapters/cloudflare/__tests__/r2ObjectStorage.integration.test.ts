import { env } from "cloudflare:test";
import type { R2Bucket } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
import { StorageNotFoundError } from "@/core/domain/media/ports/objectStorage";
import { R2ObjectStorage, type R2PresignConfig } from "../r2ObjectStorage";

// `ObjectStorage.delete` treats a missing key as success — a hard port
// contract the #468 reclaim chain structurally depends on (ADR-002): a
// commit whose `put` failed leaves a blobless pending row, and purge
// must run it to completion instead of stalling it in `deleting`. The
// application-level tests exercise that chain against the in-memory
// fake only, so the contract is pinned against the real R2 adapter here
// (miniflare `OBJECT_STORAGE` binding). A regression such as a `head`
// pre-check throwing `StorageNotFoundError` fails these tests.

// Data-plane ops never consult the presign config; only the binding is
// exercised here.
const PRESIGN_CONFIG: R2PresignConfig = {
  accountId: "test-account",
  bucketName: "test-objects",
  accessKeyId: "test-key-id",
  secretAccessKey: "test-secret",
};

// Same workerd-vs-npm type-skew narrowing as
// `handlers.integration.test.ts`: the binding is always present at
// runtime (`vitest.config.integration.ts` registers it), but the
// generated env types it as optional and with workerd's `R2Bucket`.
function objectStorageBinding(): R2Bucket {
  if (!env.OBJECT_STORAGE) {
    throw new Error(
      "OBJECT_STORAGE binding missing — check vitest.config.integration.ts",
    );
  }
  return env.OBJECT_STORAGE as unknown as R2Bucket;
}

describe("R2ObjectStorage.delete (real R2 binding)", () => {
  it("resolves for a key that never existed (missing key = success)", async () => {
    const storage = new R2ObjectStorage(objectStorageBinding(), PRESIGN_CONFIG);

    await expect(
      storage.delete("owner/source/0193e7d0-0000-7000-a000-4000000dead1"),
    ).resolves.toBeUndefined();
  });

  it("deletes an existing object and stays successful on a repeat delete", async () => {
    const storage = new R2ObjectStorage(objectStorageBinding(), PRESIGN_CONFIG);
    const key = "owner/source/0193e7d0-0000-7000-a000-4000000dead2";
    await storage.put(key, new Uint8Array([1, 2, 3]).buffer, "application/pdf");

    await expect(storage.delete(key)).resolves.toBeUndefined();
    await expect(storage.stat(key)).rejects.toThrow(StorageNotFoundError);
    // Second delete of the now-missing key still succeeds.
    await expect(storage.delete(key)).resolves.toBeUndefined();
  });
});
