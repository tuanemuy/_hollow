import type { R2Bucket } from "@cloudflare/workers-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAttachmentDisposition,
  R2ObjectStorage,
  type R2PresignConfig,
} from "../r2ObjectStorage";

// `buildAttachmentDisposition` is load-bearing: it produces the
// `response-content-disposition` value that becomes a SigV4-signed query
// parameter (Issue #452 ADR-003). RFC 6266 (ASCII `filename=`) + RFC 5987
// (`filename*=UTF-8''`) must both be emitted so non-ASCII names survive
// and the quoted ASCII token stays well-formed.
describe("buildAttachmentDisposition", () => {
  it("keeps a plain ASCII filename in both the quoted token and the encoded form", () => {
    const result = buildAttachmentDisposition("report.pdf");
    expect(result).toBe(
      `attachment; filename="report.pdf"; filename*=UTF-8''report.pdf`,
    );
  });

  it("percent-encodes a non-ASCII (Japanese) filename and replaces it with `_` in the ASCII fallback", () => {
    const result = buildAttachmentDisposition("資料.pdf");
    // Each non-ASCII byte collapses to `_` in the quoted fallback.
    expect(result).toContain(`filename="__.pdf"`);
    // RFC 5987 form carries the exact UTF-8 name, percent-encoded.
    const encoded = encodeURIComponent("資料.pdf");
    expect(result).toContain(`filename*=UTF-8''${encoded}`);
  });

  it("strips embedded quotes and backslashes from the ASCII fallback so the quoted token stays well-formed", () => {
    const result = buildAttachmentDisposition('a"b\\c.pdf');
    expect(result).toContain(`filename="a_b_c.pdf"`);
    // The `filename*` form still carries the literal characters
    // (percent-encoded where required).
    expect(result).toContain("filename*=UTF-8''");
    expect(result).toContain(encodeURIComponent('a"b\\c.pdf'));
  });

  it("replaces control characters in the ASCII fallback", () => {
    const result = buildAttachmentDisposition("a\tb\nc.pdf");
    expect(result).toContain(`filename="a_b_c.pdf"`);
  });

  it("falls back to `download` when the ASCII fallback would be empty", () => {
    // A name made entirely of non-ASCII bytes collapses to all `_`, which
    // is truthy; an empty input collapses to "" and triggers the literal
    // `download` fallback.
    const result = buildAttachmentDisposition("");
    expect(result).toBe(`attachment; filename="download"; filename*=UTF-8''`);
  });
});

// The presign path never touches the bucket binding (it only reads the
// presign config + URL host), so a bare cast is enough to exercise SigV4
// query construction in the Node unit pool.
const FAKE_BUCKET = {} as R2Bucket;
const PRESIGN_CONFIG: R2PresignConfig = {
  accountId: "acct123",
  bucketName: "media",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "secretExampleKey",
};

describe("R2ObjectStorage.presignDownload", () => {
  it("includes a signed `response-content-disposition` query when a downloadFileName is supplied", async () => {
    const storage = new R2ObjectStorage(FAKE_BUCKET, PRESIGN_CONFIG);
    const url = await storage.presignDownload("owner/source/abc", 60, {
      downloadFileName: "report.pdf",
    });

    const disposition = url.searchParams.get("response-content-disposition");
    expect(disposition).toBe(buildAttachmentDisposition("report.pdf"));
    // The disposition is part of the signed query: a signature is present.
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]+$/);
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
  });

  it("omits `response-content-disposition` for a plain (inline) presign", async () => {
    const storage = new R2ObjectStorage(FAKE_BUCKET, PRESIGN_CONFIG);
    const url = await storage.presignDownload("owner/source/abc", 60);

    expect(url.searchParams.get("response-content-disposition")).toBeNull();
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]+$/);
  });
});

// `presign()` preserves the endpoint's path prefix so a local dev proxy
// endpoint (`http://localhost:8787/dev/r2`) can be signed. The golden
// strings below pin the default-endpoint output byte-for-byte at the
// fixed system time so prefix handling can never alter it.
describe("R2ObjectStorage.presign — endpoint path handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-13T00:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("default endpoint: presignUpload output matches the golden URL", async () => {
    const storage = new R2ObjectStorage(FAKE_BUCKET, PRESIGN_CONFIG);
    const url = await storage.presignUpload(
      "owner/source/abc",
      "image/png",
      300,
    );
    expect(url.toString()).toBe(
      "https://acct123.r2.cloudflarestorage.com/media/owner/source/abc?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAEXAMPLE%2F20260613%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20260613T000000Z&X-Amz-Expires=300&X-Amz-SignedHeaders=content-type%3Bhost&X-Amz-Signature=1ccf44e1077140ca3452dba5b738f26a9b67911a3e90b0dd49eba4502fffa36b",
    );
  });

  it("default endpoint: presignDownload with downloadFileName matches the golden URL", async () => {
    const storage = new R2ObjectStorage(FAKE_BUCKET, PRESIGN_CONFIG);
    const url = await storage.presignDownload("owner/source/abc", 60, {
      downloadFileName: "report.pdf",
    });
    expect(url.toString()).toBe(
      "https://acct123.r2.cloudflarestorage.com/media/owner/source/abc?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAEXAMPLE%2F20260613%2Fauto%2Fs3%2Faws4_request&X-Amz-Date=20260613T000000Z&X-Amz-Expires=60&X-Amz-SignedHeaders=host&response-content-disposition=attachment%3B+filename%3D%22report.pdf%22%3B+filename*%3DUTF-8%27%27report.pdf&X-Amz-Signature=7573eebf4941bde3bddd9967881d2c5caa4e84286acc25037fef8932bc37befe",
    );
  });

  it("path-prefixed endpoint: signs `/dev/r2/<bucket>/<key>`", async () => {
    const storage = new R2ObjectStorage(FAKE_BUCKET, {
      ...PRESIGN_CONFIG,
      endpoint: "http://localhost:8787/dev/r2",
    });
    const url = await storage.presignUpload(
      "owner/source/abc",
      "image/png",
      300,
    );
    expect(url.origin).toBe("http://localhost:8787");
    expect(url.pathname).toBe("/dev/r2/media/owner/source/abc");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]+$/);
  });

  it("path-prefixed endpoint with a trailing slash normalises to a single separator", async () => {
    const storage = new R2ObjectStorage(FAKE_BUCKET, {
      ...PRESIGN_CONFIG,
      endpoint: "http://localhost:8787/dev/r2/",
    });
    const url = await storage.presignDownload("owner/source/abc", 60);
    expect(url.pathname).toBe("/dev/r2/media/owner/source/abc");
  });
});
