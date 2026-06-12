/**
 * Shared AWS SigV4 primitives for the R2 S3-compatible endpoint.
 *
 * Used by both presigned-URL minting (`r2ObjectStorage.ts`) and
 * presigned-URL verification (`r2PresignVerify.ts`). Keeping a single
 * implementation guarantees the verifier reconstructs the exact same
 * canonical form the signer produced — any drift between the two would
 * make locally-minted URLs fail local verification.
 */

export const R2_REGION = "auto";
export const S3_SERVICE = "s3";
export const UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";

// `YYYYMMDDTHHMMSSZ` per SigV4 spec.
export function toAmzDate(now: Date): string {
  const iso = now.toISOString();
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

// SigV4 follows RFC 3986: every byte except `A-Z a-z 0-9 - _ . ~` is
// percent-encoded. `encodeURIComponent` leaves `! * ' ( )` unescaped,
// so they are re-encoded here.
export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!*'()]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

// S3 keys are percent-encoded segment-wise but `/` is preserved as a
// path separator. R2 follows the same convention.
export function encodeKey(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeRfc3986(segment))
    .join("/");
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return toHex(new Uint8Array(buf));
}

export async function hmacSha256(
  key: ArrayBuffer | Uint8Array,
  data: string,
): Promise<ArrayBuffer> {
  const keyBytes =
    key instanceof Uint8Array
      ? (key.buffer.slice(
          key.byteOffset,
          key.byteOffset + key.byteLength,
        ) as ArrayBuffer)
      : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

export async function hmacHex(
  key: ArrayBuffer | Uint8Array,
  data: string,
): Promise<string> {
  const sig = await hmacSha256(key, data);
  return toHex(new Uint8Array(sig));
}

export async function deriveSigningKey(
  secretAccessKey: string,
  dateStamp: string,
): Promise<ArrayBuffer> {
  const kSecret = new TextEncoder().encode(`AWS4${secretAccessKey}`);
  const kDate = await hmacSha256(kSecret, dateStamp);
  const kRegion = await hmacSha256(kDate, R2_REGION);
  const kService = await hmacSha256(kRegion, S3_SERVICE);
  return hmacSha256(kService, "aws4_request");
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] as number).toString(16).padStart(2, "0");
  }
  return out;
}
