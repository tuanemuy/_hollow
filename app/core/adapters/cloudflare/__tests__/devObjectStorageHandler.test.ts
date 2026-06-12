import type { R2Bucket } from "@cloudflare/workers-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDevObjectStorageResponse,
  resolveDevObjectStorageGate,
} from "../devObjectStorageHandler";
import { R2ObjectStorage, type R2PresignConfig } from "../r2ObjectStorage";

const CONFIG: R2PresignConfig = {
  accountId: "acct123",
  bucketName: "media",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "secretExampleKey",
  endpoint: "http://localhost:8787/dev/r2",
};

type StoredObject = { body: ArrayBuffer; contentType: string | undefined };

// Minimal in-memory R2 fake covering the `put` / `get` surface the dev
// proxy touches. Cast to `R2Bucket` like the other adapter tests.
function fakeBucket(store: Map<string, StoredObject>): R2Bucket {
  return {
    put: async (
      key: string,
      body: ArrayBuffer,
      options?: { httpMetadata?: { contentType?: string } },
    ) => {
      store.set(key, { body, contentType: options?.httpMetadata?.contentType });
      return null;
    },
    get: async (key: string) => {
      const stored = store.get(key);
      if (!stored) return null;
      return {
        httpMetadata: { contentType: stored.contentType },
        arrayBuffer: async () => stored.body,
      };
    },
  } as unknown as R2Bucket;
}

function presigner(): R2ObjectStorage {
  return new R2ObjectStorage({} as R2Bucket, CONFIG);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-13T00:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("buildDevObjectStorageResponse — PUT", () => {
  it("stores the body with its contentType and returns 200 for a valid presigned PUT", async () => {
    const store = new Map<string, StoredObject>();
    const url = await presigner().presignUpload(
      "owner/source/abc",
      "image/png",
      300,
    );
    const payload = new TextEncoder().encode("png-bytes");
    const response = await buildDevObjectStorageResponse({
      request: new Request(url, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: payload,
      }),
      bucket: fakeBucket(store),
      bucketName: "media",
      presignConfig: CONFIG,
    });
    expect(response.status).toBe(200);
    const stored = store.get("owner/source/abc");
    expect(stored?.contentType).toBe("image/png");
    expect(new TextDecoder().decode(stored?.body)).toBe("png-bytes");
  });

  it("returns 403 when the Content-Type differs from the signed one (nothing stored)", async () => {
    const store = new Map<string, StoredObject>();
    const url = await presigner().presignUpload(
      "owner/source/abc",
      "image/png",
      300,
    );
    const response = await buildDevObjectStorageResponse({
      request: new Request(url, {
        method: "PUT",
        headers: { "content-type": "text/html" },
        body: "x",
      }),
      bucket: fakeBucket(store),
      bucketName: "media",
      presignConfig: CONFIG,
    });
    expect(response.status).toBe(403);
    expect(store.size).toBe(0);
  });

  it("returns 403 for a tampered signature", async () => {
    const store = new Map<string, StoredObject>();
    const url = await presigner().presignUpload(
      "owner/source/abc",
      "image/png",
      300,
    );
    url.searchParams.set("X-Amz-Signature", "0".repeat(64));
    const response = await buildDevObjectStorageResponse({
      request: new Request(url, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: "x",
      }),
      bucket: fakeBucket(store),
      bucketName: "media",
      presignConfig: CONFIG,
    });
    expect(response.status).toBe(403);
    expect(store.size).toBe(0);
  });

  it("returns 403 for an expired URL", async () => {
    const store = new Map<string, StoredObject>();
    const url = await presigner().presignUpload(
      "owner/source/abc",
      "image/png",
      300,
    );
    vi.setSystemTime(new Date("2026-06-13T00:05:01.000Z"));
    const response = await buildDevObjectStorageResponse({
      request: new Request(url, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: "x",
      }),
      bucket: fakeBucket(store),
      bucketName: "media",
      presignConfig: CONFIG,
    });
    expect(response.status).toBe(403);
  });

  it("returns 404 for a bucket name mismatch", async () => {
    const url = await presigner().presignUpload(
      "owner/source/abc",
      "image/png",
      300,
    );
    const response = await buildDevObjectStorageResponse({
      request: new Request(url, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: "x",
      }),
      bucket: fakeBucket(new Map()),
      bucketName: "other-bucket",
      presignConfig: CONFIG,
    });
    expect(response.status).toBe(404);
  });
});

describe("buildDevObjectStorageResponse — GET", () => {
  it("serves the stored object with its content-type for a valid presigned GET", async () => {
    const store = new Map<string, StoredObject>([
      [
        "owner/source/abc",
        {
          body: new TextEncoder().encode("png-bytes").buffer as ArrayBuffer,
          contentType: "image/png",
        },
      ],
    ]);
    const url = await presigner().presignDownload("owner/source/abc", 60);
    const response = await buildDevObjectStorageResponse({
      request: new Request(url, { method: "GET" }),
      bucket: fakeBucket(store),
      bucketName: "media",
      presignConfig: CONFIG,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe("attachment");
    expect(await response.text()).toBe("png-bytes");
  });

  it("returns 403 for an expired GET URL", async () => {
    const store = new Map<string, StoredObject>([
      [
        "owner/source/abc",
        { body: new ArrayBuffer(1), contentType: "image/png" },
      ],
    ]);
    const url = await presigner().presignDownload("owner/source/abc", 60);
    vi.setSystemTime(new Date("2026-06-13T00:01:01.000Z"));
    const response = await buildDevObjectStorageResponse({
      request: new Request(url, { method: "GET" }),
      bucket: fakeBucket(store),
      bucketName: "media",
      presignConfig: CONFIG,
    });
    expect(response.status).toBe(403);
  });

  it("reflects a signed response-content-disposition onto the response", async () => {
    const store = new Map<string, StoredObject>([
      [
        "owner/source/abc",
        {
          body: new ArrayBuffer(1),
          contentType: "application/pdf",
        },
      ],
    ]);
    const url = await presigner().presignDownload("owner/source/abc", 60, {
      downloadFileName: "report.pdf",
    });
    const response = await buildDevObjectStorageResponse({
      request: new Request(url, { method: "GET" }),
      bucket: fakeBucket(store),
      bucketName: "media",
      presignConfig: CONFIG,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(
      'filename="report.pdf"',
    );
  });

  it("returns 404 when the object does not exist", async () => {
    const url = await presigner().presignDownload("owner/source/missing", 60);
    const response = await buildDevObjectStorageResponse({
      request: new Request(url, { method: "GET" }),
      bucket: fakeBucket(new Map()),
      bucketName: "media",
      presignConfig: CONFIG,
    });
    expect(response.status).toBe(404);
  });

  it("returns 403 for an unsigned GET", async () => {
    const response = await buildDevObjectStorageResponse({
      request: new Request("http://localhost:8787/dev/r2/media/owner/abc", {
        method: "GET",
      }),
      bucket: fakeBucket(new Map()),
      bucketName: "media",
      presignConfig: CONFIG,
    });
    expect(response.status).toBe(403);
  });
});

describe("buildDevObjectStorageResponse — method / path guards", () => {
  it("returns 405 for non-PUT/GET methods", async () => {
    const url = await presigner().presignDownload("owner/source/abc", 60);
    const response = await buildDevObjectStorageResponse({
      request: new Request(url, { method: "DELETE" }),
      bucket: fakeBucket(new Map()),
      bucketName: "media",
      presignConfig: CONFIG,
    });
    expect(response.status).toBe(405);
  });

  it("returns 404 when no key follows the bucket segment", async () => {
    const response = await buildDevObjectStorageResponse({
      request: new Request("http://localhost:8787/dev/r2/media/", {
        method: "GET",
      }),
      bucket: fakeBucket(new Map()),
      bucketName: "media",
      presignConfig: CONFIG,
    });
    expect(response.status).toBe(404);
  });

  it("stores under the percent-decoded key while verifying the raw signed pathname", async () => {
    const store = new Map<string, StoredObject>();
    const key = "owner/source/file name.png";
    const url = await presigner().presignUpload(key, "image/png", 300);
    const response = await buildDevObjectStorageResponse({
      request: new Request(url, {
        method: "PUT",
        headers: { "content-type": "image/png" },
        body: "x",
      }),
      bucket: fakeBucket(store),
      bucketName: "media",
      presignConfig: CONFIG,
    });
    expect(response.status).toBe(200);
    expect(store.has(key)).toBe(true);
  });

  it("returns 404 (not a thrown URIError) for malformed percent-encoding in the key", async () => {
    const response = await buildDevObjectStorageResponse({
      request: new Request("http://localhost:8787/dev/r2/media/%zz", {
        method: "GET",
      }),
      bucket: fakeBucket(new Map()),
      bucketName: "media",
      presignConfig: CONFIG,
    });
    expect(response.status).toBe(404);
  });
});

describe("resolveDevObjectStorageGate", () => {
  const devPath = "/dev/r2/media/owner/abc";

  it.each([
    undefined,
    "false",
    "TRUE",
    "1",
  ])("passes through when the flag is %j (strict 'true' comparison)", (flag) => {
    expect(
      resolveDevObjectStorageGate({
        flag,
        pathname: devPath,
        hasBucket: true,
        hasPresignConfig: true,
      }),
    ).toBe("pass");
  });

  it("passes through paths outside the dev prefix even when enabled", () => {
    expect(
      resolveDevObjectStorageGate({
        flag: "true",
        pathname: "/api/notes",
        hasBucket: true,
        hasPresignConfig: true,
      }),
    ).toBe("pass");
  });

  it.each([
    { hasBucket: false, hasPresignConfig: true },
    { hasBucket: true, hasPresignConfig: false },
    { hasBucket: false, hasPresignConfig: false },
  ])("returns not_found when env is incomplete (%j)", ({
    hasBucket,
    hasPresignConfig,
  }) => {
    expect(
      resolveDevObjectStorageGate({
        flag: "true",
        pathname: devPath,
        hasBucket,
        hasPresignConfig,
      }),
    ).toBe("not_found");
  });

  it("handles when the flag is 'true', the path matches, and env is complete", () => {
    expect(
      resolveDevObjectStorageGate({
        flag: "true",
        pathname: devPath,
        hasBucket: true,
        hasPresignConfig: true,
      }),
    ).toBe("handle");
  });
});
