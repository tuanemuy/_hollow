import type { R2Bucket } from "@cloudflare/workers-types";
import {
  type ObjectMetadata,
  type ObjectStorage,
  StorageNotFoundError,
  StorageUnavailableError,
} from "@/core/domain/media/ports/objectStorage";
import {
  deriveSigningKey,
  encodeKey,
  encodeRfc3986,
  hmacHex,
  R2_REGION,
  S3_SERVICE,
  sha256Hex,
  toAmzDate,
  UNSIGNED_PAYLOAD,
} from "./r2Sigv4";

/**
 * Credentials and endpoint configuration required to presign R2 object
 * URLs. R2's Worker binding exposes data-plane methods (`put` / `get`
 * / `delete`) but does not natively mint presigned URLs — those are
 * minted against the S3-compatible endpoint using AWS SigV4. The
 * account-scoped endpoint is `https://<accountId>.r2.cloudflarestorage.com`.
 */
export type R2PresignConfig = Readonly<{
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  /**
   * Optional override for the endpoint used in presigned URLs. When set
   * (e.g. a custom domain, or the local dev proxy
   * `http://localhost:8787/dev/r2` — Issue #657), presigned URLs are
   * issued against this origin and any path prefix it carries is
   * preserved in front of `/<bucket>/<key>`. Defaults to the
   * account-scoped R2 endpoint.
   */
  endpoint?: string;
}>;

/**
 * Cloudflare R2 implementation of the {@link ObjectStorage} port.
 *
 * Data-plane operations (`put` / `get` / `delete`) go through the R2
 * Worker binding so they incur no S3-API egress and need no credentials.
 * Presigned URL minting (`presignDownload` / `presignUpload`) uses the
 * S3-compatible HTTPS endpoint and AWS SigV4 query-string signing —
 * R2 currently does not expose a binding method for this, so the
 * adapter does the signing itself with Web Crypto.
 *
 * Errors are translated into the shared {@link ObjectStorage} contract:
 * lookup misses become {@link StorageNotFoundError}; transient binding
 * or signing failures become {@link StorageUnavailableError}.
 *
 * Production-runtime fallback for missing R2 bindings lives in the DI
 * module (`serverCloudflare.ts`) as a private inline factory — see
 * `.issue/100/adr.md` ADR-001. This file intentionally exports only
 * the real adapter so the API surface stays focused.
 */
export class R2ObjectStorage implements ObjectStorage {
  private readonly endpoint: string;

  constructor(
    private readonly bucket: R2Bucket,
    private readonly presignConfig: R2PresignConfig,
  ) {
    this.endpoint =
      presignConfig.endpoint ??
      `https://${presignConfig.accountId}.r2.cloudflarestorage.com`;
  }

  async put(
    key: string,
    bytes: ArrayBuffer,
    contentType: string,
  ): Promise<void> {
    try {
      await this.bucket.put(key, bytes, {
        httpMetadata: { contentType },
      });
    } catch (cause) {
      throw new StorageUnavailableError(`R2 put failed for key ${key}`, cause);
    }
  }

  async get(key: string): Promise<ArrayBuffer> {
    let object: Awaited<ReturnType<R2Bucket["get"]>>;
    try {
      object = await this.bucket.get(key);
    } catch (cause) {
      throw new StorageUnavailableError(`R2 get failed for key ${key}`, cause);
    }
    if (object === null) {
      throw new StorageNotFoundError(`R2 object not found: ${key}`);
    }
    try {
      return await object.arrayBuffer();
    } catch (cause) {
      throw new StorageUnavailableError(
        `R2 body read failed for key ${key}`,
        cause,
      );
    }
  }

  async stat(key: string): Promise<ObjectMetadata> {
    let head: Awaited<ReturnType<R2Bucket["head"]>>;
    try {
      head = await this.bucket.head(key);
    } catch (cause) {
      throw new StorageUnavailableError(`R2 head failed for key ${key}`, cause);
    }
    if (head === null) {
      throw new StorageNotFoundError(`R2 object not found: ${key}`);
    }
    return {
      byteSize: head.size,
      contentType: head.httpMetadata?.contentType ?? "application/octet-stream",
    };
  }

  async delete(key: string): Promise<void> {
    try {
      await this.bucket.delete(key);
    } catch (cause) {
      throw new StorageUnavailableError(
        `R2 delete failed for key ${key}`,
        cause,
      );
    }
  }

  presignDownload(
    key: string,
    ttlSec: number,
    options?: { downloadFileName?: string },
  ): Promise<URL> {
    return this.presign(
      "GET",
      key,
      ttlSec,
      undefined,
      options?.downloadFileName,
    );
  }

  presignUpload(
    key: string,
    contentType: string,
    ttlSec: number,
  ): Promise<URL> {
    return this.presign("PUT", key, ttlSec, contentType, undefined);
  }

  // ---- SigV4 query-string signing -----------------------------------
  //
  // The S3-compatible R2 endpoint requires AWS SigV4. For a presigned
  // URL the signature lives in the query string and the request body
  // hash is `UNSIGNED-PAYLOAD`, so the URL alone is the bearer of
  // authorization. PUT presigns pin `Content-Type` into the signed
  // headers so the backend rejects uploads that don't match.
  //
  // The implementation follows AWS's "Signature Version 4 signing
  // process" reference; the only R2-specific bits are `region = auto`
  // and the account-scoped endpoint.
  private async presign(
    method: "GET" | "PUT",
    key: string,
    ttlSec: number,
    contentType: string | undefined,
    downloadFileName: string | undefined,
  ): Promise<URL> {
    if (!Number.isFinite(ttlSec) || ttlSec <= 0 || ttlSec > 7 * 86_400) {
      throw new StorageUnavailableError(
        `Invalid presign ttlSec: ${ttlSec} (must be 1..604800)`,
      );
    }
    try {
      const now = new Date();
      const amzDate = toAmzDate(now);
      const dateStamp = amzDate.slice(0, 8);
      const credentialScope = `${dateStamp}/${R2_REGION}/${S3_SERVICE}/aws4_request`;
      const credential = `${this.presignConfig.accessKeyId}/${credentialScope}`;

      const url = new URL(this.endpoint);
      // Preserve any path prefix carried by the endpoint (e.g. the local
      // dev proxy at `http://localhost:8787/dev/r2`). The default
      // account-scoped endpoint has pathname `/`, which normalises to an
      // empty prefix and reproduces the historical `/<bucket>/<key>` form
      // byte-for-byte.
      const basePath = url.pathname.replace(/\/+$/, "");
      url.pathname = `${basePath}/${this.presignConfig.bucketName}/${encodeKey(key)}`;

      const signedHeaderNames: string[] = ["host"];
      const canonicalHeaderEntries: Array<[string, string]> = [
        ["host", url.host],
      ];
      if (method === "PUT" && contentType !== undefined) {
        signedHeaderNames.push("content-type");
        canonicalHeaderEntries.push(["content-type", contentType]);
      }
      signedHeaderNames.sort();
      canonicalHeaderEntries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
      const signedHeaders = signedHeaderNames.join(";");

      const queryParams: Array<[string, string]> = [
        ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
        ["X-Amz-Credential", credential],
        ["X-Amz-Date", amzDate],
        ["X-Amz-Expires", String(Math.floor(ttlSec))],
        ["X-Amz-SignedHeaders", signedHeaders],
      ];
      // `response-content-disposition` overrides the served disposition
      // for this presigned GET. It is a SigV4-signed query parameter, so
      // it MUST be pushed onto `queryParams` BEFORE the canonical string
      // is built and signed. Appending it to the URL after signing would
      // fall outside the signature coverage and R2 returns 403
      // `SignatureDoesNotMatch` (Issue #452 ADR-003). `encodeRfc3986`
      // below makes `;`, spaces and `"` safe.
      if (method === "GET" && downloadFileName !== undefined) {
        queryParams.push([
          "response-content-disposition",
          buildAttachmentDisposition(downloadFileName),
        ]);
      }
      const canonicalQueryString = queryParams
        .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
        .sort()
        .join("&");

      const canonicalHeaders = `${canonicalHeaderEntries
        .map(([k, v]) => `${k}:${v.trim()}`)
        .join("\n")}\n`;

      const canonicalRequest = [
        method,
        url.pathname,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        UNSIGNED_PAYLOAD,
      ].join("\n");

      const stringToSign = [
        "AWS4-HMAC-SHA256",
        amzDate,
        credentialScope,
        await sha256Hex(canonicalRequest),
      ].join("\n");

      const signingKey = await deriveSigningKey(
        this.presignConfig.secretAccessKey,
        dateStamp,
      );
      const signature = await hmacHex(signingKey, stringToSign);

      const signedUrl = new URL(url.toString());
      for (const [k, v] of queryParams) {
        signedUrl.searchParams.set(k, v);
      }
      signedUrl.searchParams.set("X-Amz-Signature", signature);
      return signedUrl;
    } catch (cause) {
      if (cause instanceof StorageUnavailableError) throw cause;
      throw new StorageUnavailableError(
        `R2 presign failed for key ${key}`,
        cause,
      );
    }
  }
}

// Build a `Content-Disposition: attachment` value with both an ASCII
// `filename` fallback (RFC 6266) and an RFC 5987 `filename*=UTF-8''`
// form so non-ASCII names survive. `OriginalFileName` admits arbitrary
// printable text (incl. quotes / non-ASCII), so the ASCII fallback
// strips control / quote / path-separator bytes to keep the quoted token
// well-formed, while `filename*` carries the exact UTF-8 name. The whole
// string is later percent-encoded by `encodeRfc3986` for the query
// parameter, so it stays a single signed token.
export function buildAttachmentDisposition(fileName: string): string {
  const asciiFallback =
    // biome-ignore lint/suspicious/noControlCharactersInRegex: strip C0 controls from the quoted token
    fileName.replace(/[ -"\\/]/g, "_").replace(/[^\x20-\x7e]/g, "_") ||
    "download";
  const rfc5987 = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${rfc5987}`;
}
