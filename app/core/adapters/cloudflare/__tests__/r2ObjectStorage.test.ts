import type { R2Bucket } from "@cloudflare/workers-types";
import { describe, expect, it } from "vitest";
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
