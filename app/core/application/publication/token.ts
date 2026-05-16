/**
 * Share-link token utilities scoped to the publication application
 * layer.
 *
 * The raw token is generated with the runtime's CSPRNG, encoded with
 * URL-safe base64 (no padding), and exists only at the moment of issue
 * — storage and lookup are keyed off the SHA-256 hash so a DB
 * compromise does not reveal live tokens.
 *
 * No port abstraction: token generation reduces to
 * `crypto.getRandomValues` + `SubtleCrypto.digest`, both of which are
 * universally available on Cloudflare Workers, Node, and browsers. The
 * complexity that would justify a port (algorithm choice / cost factor
 * tuning) does not exist here.
 */

const DEFAULT_TOKEN_BYTES = 32;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generateShareLinkToken(
  byteLength: number = DEFAULT_TOKEN_BYTES,
): string {
  if (!Number.isInteger(byteLength) || byteLength < 16 || byteLength > 64) {
    throw new RangeError(
      `Share-link token byte length must be an integer in [16, 64]; got ${byteLength}`,
    );
  }
  const bytes = new Uint8Array(byteLength);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export async function hashShareLinkToken(token: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      "Web Crypto SubtleCrypto is unavailable; share-link token hashing requires a runtime with globalThis.crypto.subtle",
    );
  }
  const encoded = new TextEncoder().encode(token);
  const buffer = new ArrayBuffer(encoded.byteLength);
  new Uint8Array(buffer).set(encoded);
  const digest = await subtle.digest("SHA-256", buffer);
  return toBase64Url(new Uint8Array(digest));
}
