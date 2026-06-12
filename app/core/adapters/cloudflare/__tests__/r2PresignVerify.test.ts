import type { R2Bucket } from "@cloudflare/workers-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { R2ObjectStorage, type R2PresignConfig } from "../r2ObjectStorage";
import { verifyPresignedRequest } from "../r2PresignVerify";

const FAKE_BUCKET = {} as R2Bucket;
const CONFIG: R2PresignConfig = {
  accountId: "acct123",
  bucketName: "media",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "secretExampleKey",
  endpoint: "http://localhost:8787/dev/r2",
};

function storage(config: R2PresignConfig = CONFIG): R2ObjectStorage {
  return new R2ObjectStorage(FAKE_BUCKET, config);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-13T00:00:00.000Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

// Round-trip: URLs minted by `R2ObjectStorage.presign*` must pass
// verification with the same credentials. This is the load-bearing
// guarantee that the signer and the verifier share one canonical form
// (ADR-002 of Issue #657).
describe("verifyPresignedRequest — round trip", () => {
  it("accepts a presignUpload URL (PUT with matching Content-Type)", async () => {
    const url = await storage().presignUpload(
      "owner/source/abc",
      "image/png",
      300,
    );
    const result = await verifyPresignedRequest({
      method: "PUT",
      url,
      headers: new Headers({ "content-type": "image/png" }),
      config: CONFIG,
    });
    expect(result).toEqual({ ok: true });
  });

  it("accepts a presignDownload URL without downloadFileName", async () => {
    const url = await storage().presignDownload("owner/source/abc", 60);
    const result = await verifyPresignedRequest({
      method: "GET",
      url,
      headers: new Headers(),
      config: CONFIG,
    });
    expect(result).toEqual({ ok: true });
  });

  it("accepts a presignDownload URL with a signed response-content-disposition (incl. non-ASCII filename)", async () => {
    const url = await storage().presignDownload("owner/source/abc", 60, {
      downloadFileName: "資料 (1).pdf",
    });
    const result = await verifyPresignedRequest({
      method: "GET",
      url,
      headers: new Headers(),
      config: CONFIG,
    });
    expect(result).toEqual({ ok: true });
  });

  it("accepts a URL minted against the default (path-less) endpoint", async () => {
    const defaultConfig: R2PresignConfig = {
      accountId: "acct123",
      bucketName: "media",
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "secretExampleKey",
    };
    const url = await storage(defaultConfig).presignDownload("k", 60);
    const result = await verifyPresignedRequest({
      method: "GET",
      url,
      headers: new Headers(),
      config: defaultConfig,
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("verifyPresignedRequest — rejections", () => {
  it("rejects a tampered signature", async () => {
    const url = await storage().presignDownload("owner/source/abc", 60);
    const sig = url.searchParams.get("X-Amz-Signature") as string;
    const flipped = sig.endsWith("0")
      ? `${sig.slice(0, -1)}1`
      : `${sig.slice(0, -1)}0`;
    url.searchParams.set("X-Amz-Signature", flipped);
    const result = await verifyPresignedRequest({
      method: "GET",
      url,
      headers: new Headers(),
      config: CONFIG,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a query parameter appended after signing", async () => {
    const url = await storage().presignDownload("owner/source/abc", 60);
    url.searchParams.set("response-content-disposition", "attachment");
    const result = await verifyPresignedRequest({
      method: "GET",
      url,
      headers: new Headers(),
      config: CONFIG,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects an expired URL (clock advanced past X-Amz-Expires)", async () => {
    const url = await storage().presignDownload("owner/source/abc", 60);
    vi.setSystemTime(new Date("2026-06-13T00:01:01.000Z"));
    const result = await verifyPresignedRequest({
      method: "GET",
      url,
      headers: new Headers(),
      config: CONFIG,
    });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a method mismatch (GET request against a PUT presign)", async () => {
    const url = await storage().presignUpload(
      "owner/source/abc",
      "image/png",
      300,
    );
    const result = await verifyPresignedRequest({
      method: "GET",
      url,
      headers: new Headers({ "content-type": "image/png" }),
      config: CONFIG,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects different credentials", async () => {
    const url = await storage().presignDownload("owner/source/abc", 60);
    const result = await verifyPresignedRequest({
      method: "GET",
      url,
      headers: new Headers(),
      config: { ...CONFIG, accessKeyId: "AKIAOTHER" },
    });
    expect(result).toEqual({ ok: false, reason: "credential_mismatch" });
  });

  it("rejects a wrong secret key with matching accessKeyId", async () => {
    const url = await storage().presignDownload("owner/source/abc", 60);
    const result = await verifyPresignedRequest({
      method: "GET",
      url,
      headers: new Headers(),
      config: { ...CONFIG, secretAccessKey: "otherSecret" },
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a Content-Type that differs from the signed one", async () => {
    const url = await storage().presignUpload(
      "owner/source/abc",
      "image/png",
      300,
    );
    const result = await verifyPresignedRequest({
      method: "PUT",
      url,
      headers: new Headers({ "content-type": "text/html" }),
      config: CONFIG,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("rejects a missing Content-Type header when content-type is a signed header", async () => {
    const url = await storage().presignUpload(
      "owner/source/abc",
      "image/png",
      300,
    );
    const result = await verifyPresignedRequest({
      method: "PUT",
      url,
      headers: new Headers(),
      config: CONFIG,
    });
    expect(result).toEqual({ ok: false, reason: "signature_mismatch" });
  });

  it("accepts a URL exactly at the expiry instant (boundary is valid)", async () => {
    const url = await storage().presignDownload("owner/source/abc", 60);
    vi.setSystemTime(new Date("2026-06-13T00:01:00.000Z"));
    const result = await verifyPresignedRequest({
      method: "GET",
      url,
      headers: new Headers(),
      config: CONFIG,
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects 1ms past the expiry instant", async () => {
    const url = await storage().presignDownload("owner/source/abc", 60);
    vi.setSystemTime(new Date("2026-06-13T00:01:00.001Z"));
    const result = await verifyPresignedRequest({
      method: "GET",
      url,
      headers: new Headers(),
      config: CONFIG,
    });
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a URL with no SigV4 query parameters at all", async () => {
    const result = await verifyPresignedRequest({
      method: "GET",
      url: new URL("http://localhost:8787/dev/r2/media/k"),
      headers: new Headers(),
      config: CONFIG,
    });
    expect(result).toEqual({ ok: false, reason: "malformed" });
  });
});

// `malformed` branches fire before signature verification, so each case
// rewrites a single SigV4 parameter on an otherwise valid presigned URL
// and asserts the reason is `malformed` (not `signature_mismatch`).
describe("verifyPresignedRequest — malformed parameters", () => {
  async function verifyWith(mutate: (url: URL) => void): Promise<unknown> {
    const url = await storage().presignDownload("owner/source/abc", 60);
    mutate(url);
    return verifyPresignedRequest({
      method: "GET",
      url,
      headers: new Headers(),
      config: CONFIG,
    });
  }

  it("rejects an X-Amz-Date that does not match the SigV4 shape", async () => {
    expect(
      await verifyWith((url) =>
        url.searchParams.set("X-Amz-Date", "2026-06-13T00:00:00Z"),
      ),
    ).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects a shape-valid but non-existent X-Amz-Date (NaN date)", async () => {
    expect(
      await verifyWith((url) =>
        url.searchParams.set("X-Amz-Date", "20261399T000000Z"),
      ),
    ).toEqual({ ok: false, reason: "malformed" });
  });

  it.each([
    "60.5",
    "",
    "1e3",
    "0",
    "-60",
  ])("rejects X-Amz-Expires=%j", async (expires) => {
    expect(
      await verifyWith((url) => url.searchParams.set("X-Amz-Expires", expires)),
    ).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects X-Amz-Expires above the 7-day S3 ceiling", async () => {
    expect(
      await verifyWith((url) =>
        url.searchParams.set("X-Amz-Expires", "604801"),
      ),
    ).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects a missing X-Amz-SignedHeaders parameter", async () => {
    expect(
      await verifyWith((url) => url.searchParams.delete("X-Amz-SignedHeaders")),
    ).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects an X-Amz-Algorithm other than AWS4-HMAC-SHA256", async () => {
    expect(
      await verifyWith((url) =>
        url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA1"),
      ),
    ).toEqual({ ok: false, reason: "malformed" });
  });
});
