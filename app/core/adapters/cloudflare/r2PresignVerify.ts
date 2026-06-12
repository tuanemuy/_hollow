import type { R2PresignConfig } from "./r2ObjectStorage";
import {
  deriveSigningKey,
  encodeRfc3986,
  hmacHex,
  R2_REGION,
  S3_SERVICE,
  sha256Hex,
  UNSIGNED_PAYLOAD,
} from "./r2Sigv4";

/**
 * Outcome of {@link verifyPresignedRequest}. `ok: false` carries a
 * discriminated `reason` so callers (the dev object-storage proxy) can
 * log precisely while still mapping every rejection to a single 403.
 */
export type PresignVerificationResult =
  | Readonly<{ ok: true }>
  | Readonly<{
      ok: false;
      reason:
        | "malformed"
        | "credential_mismatch"
        | "expired"
        | "signature_mismatch";
    }>;

/**
 * Verify a SigV4 query-signed (presigned) request against the same
 * credentials used by `R2ObjectStorage.presign*`.
 *
 * The canonical query string is rebuilt from **all** query parameters
 * except `X-Amz-Signature`, using the same construction rule as the
 * signer (decode, re-encode each key/value with `encodeRfc3986`, sort
 * the encoded `k=v` strings, join with `&`). Because every parameter is
 * folded into the signed canonical form, any parameter appended after
 * signing breaks the signature — no whitelist needed. Canonical headers
 * are taken from the live request per `X-Amz-SignedHeaders`, so a
 * Content-Type that differs from the signed one also fails the
 * signature check.
 *
 * The signature comparison is constant-time: presigned URLs are bearer
 * credentials and `.issue/657/adr.md` ADR-001 leans on this verification as the safety net
 * against accidental production enablement of the dev proxy.
 */
export async function verifyPresignedRequest(params: {
  method: string;
  url: URL;
  headers: Headers;
  config: R2PresignConfig;
}): Promise<PresignVerificationResult> {
  const { method, url, headers, config } = params;

  const providedSignature = url.searchParams.get("X-Amz-Signature");
  const algorithm = url.searchParams.get("X-Amz-Algorithm");
  const credential = url.searchParams.get("X-Amz-Credential");
  const amzDate = url.searchParams.get("X-Amz-Date");
  const expires = url.searchParams.get("X-Amz-Expires");
  const signedHeadersParam = url.searchParams.get("X-Amz-SignedHeaders");
  if (
    providedSignature === null ||
    algorithm !== "AWS4-HMAC-SHA256" ||
    credential === null ||
    amzDate === null ||
    expires === null ||
    signedHeadersParam === null
  ) {
    return { ok: false, reason: "malformed" };
  }

  if (!/^\d{8}T\d{6}Z$/.test(amzDate)) {
    return { ok: false, reason: "malformed" };
  }
  // Strict decimal only: `Number("1e3")` would otherwise slip through
  // the integer check.
  const expiresSec = /^\d+$/.test(expires) ? Number(expires) : Number.NaN;
  if (
    !Number.isInteger(expiresSec) ||
    expiresSec <= 0 ||
    expiresSec > MAX_EXPIRES_SECONDS
  ) {
    return { ok: false, reason: "malformed" };
  }

  // The regex above only checks shape; a non-existent calendar date
  // (e.g. month 13) yields an Invalid Date whose NaN arithmetic would
  // silently skip the expiry check, so reject it as malformed (before
  // the credential comparison, which would mask it as a scope mismatch).
  const issuedAt = parseAmzDate(amzDate);
  if (Number.isNaN(issuedAt.getTime())) {
    return { ok: false, reason: "malformed" };
  }

  const dateStamp = amzDate.slice(0, 8);
  const expectedCredential = `${config.accessKeyId}/${dateStamp}/${R2_REGION}/${S3_SERVICE}/aws4_request`;
  if (credential !== expectedCredential) {
    return { ok: false, reason: "credential_mismatch" };
  }

  if (Date.now() > issuedAt.getTime() + expiresSec * 1000) {
    return { ok: false, reason: "expired" };
  }

  const canonicalQueryString = [...url.searchParams.entries()]
    .filter(([k]) => k !== "X-Amz-Signature")
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .sort()
    .join("&");

  const signedHeaderNames = signedHeadersParam.split(";");
  const canonicalHeaderEntries: Array<[string, string]> = [];
  for (const name of signedHeaderNames) {
    // Query-derived header names reach Headers.get() before signature
    // verification; an invalid token (empty, space, "(") makes it throw
    // TypeError, so reject non-token names as malformed instead.
    if (!/^[a-z0-9-]+$/.test(name)) {
      return { ok: false, reason: "malformed" };
    }
    const value = name === "host" ? url.host : headers.get(name);
    if (value === null) {
      return { ok: false, reason: "signature_mismatch" };
    }
    canonicalHeaderEntries.push([name, value]);
  }
  const canonicalHeaders = `${canonicalHeaderEntries
    .map(([k, v]) => `${k}:${v.trim()}`)
    .join("\n")}\n`;

  const canonicalRequest = [
    method,
    url.pathname,
    canonicalQueryString,
    canonicalHeaders,
    signedHeadersParam,
    UNSIGNED_PAYLOAD,
  ].join("\n");

  const credentialScope = `${dateStamp}/${R2_REGION}/${S3_SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = await deriveSigningKey(config.secretAccessKey, dateStamp);
  const expectedSignature = await hmacHex(signingKey, stringToSign);

  if (!constantTimeEqualHex(expectedSignature, providedSignature)) {
    return { ok: false, reason: "signature_mismatch" };
  }
  return { ok: true };
}

// S3's own presigned-URL ceiling (7 days); anything larger is malformed.
const MAX_EXPIRES_SECONDS = 604800;

function parseAmzDate(amzDate: string): Date {
  const iso = `${amzDate.slice(0, 4)}-${amzDate.slice(4, 6)}-${amzDate.slice(6, 8)}T${amzDate.slice(9, 11)}:${amzDate.slice(11, 13)}:${amzDate.slice(13, 15)}Z`;
  return new Date(iso);
}

// XOR-accumulate over the full provided string so the comparison time
// does not depend on where the first differing byte sits.
function constantTimeEqualHex(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}
