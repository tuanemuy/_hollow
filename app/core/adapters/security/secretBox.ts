import {
  type SecretBox,
  SecretBoxError,
  SecretBoxErrorCode,
} from "@/core/domain/adminSettings/ports/secretBox";

// ---------------------------------------------------------------------------
// AES-GCM envelope encryption for at-rest secrets (LLM api keys with
// `apiKeySource === 'db'`, etc).
// ---------------------------------------------------------------------------
//
// Wire format (base64 of the concatenation):
//
//   [1 byte version=0x01] [12 byte IV] [N byte ciphertext+tag]
//
// AES-GCM appends its 16-byte authentication tag to the ciphertext; the
// tag is verified on decrypt so any tampering surfaces as
// `InvalidCiphertext`. The version prefix is reserved for future key
// rotation / algorithm swap (a new prefix branches `decrypt` without
// invalidating existing rows).

const VERSION_V1 = 0x01;
const IV_BYTES = 12;
const KEY_BYTES = 32; // AES-256

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new SecretBoxError(
      SecretBoxErrorCode.KeyUnavailable,
      "Web Crypto SubtleCrypto is unavailable; SecretBox requires globalThis.crypto.subtle",
    );
  }
  return subtle;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

function decodeMasterKey(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new SecretBoxError(
      SecretBoxErrorCode.KeyUnavailable,
      "SecretBox master key is empty",
    );
  }
  const decoded = fromBase64(trimmed);
  if (decoded === null) {
    throw new SecretBoxError(
      SecretBoxErrorCode.KeyUnavailable,
      "SecretBox master key is not valid base64",
    );
  }
  if (decoded.length !== KEY_BYTES) {
    throw new SecretBoxError(
      SecretBoxErrorCode.KeyUnavailable,
      `SecretBox master key must decode to ${KEY_BYTES} bytes (AES-256); got ${decoded.length}`,
    );
  }
  return decoded;
}

async function importAesKey(
  subtle: SubtleCrypto,
  rawKey: Uint8Array,
): Promise<CryptoKey> {
  const buffer = new ArrayBuffer(rawKey.byteLength);
  new Uint8Array(buffer).set(rawKey);
  return subtle.importKey("raw", buffer, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * AES-GCM-based `SecretBox` backed by Web Crypto. The master key is
 * supplied as a base64-encoded 32-byte (AES-256) value — typically read
 * from a Cloudflare Worker secret binding via `env`. Constructing the
 * instance validates the key shape eagerly so misconfiguration surfaces
 * at boot rather than on the first encrypt.
 *
 * The implementation is stateless beyond the imported `CryptoKey`:
 * every `encrypt` mints a fresh random 96-bit IV (the AES-GCM
 * NIST-recommended size), and the wire format embeds a version byte so
 * future algorithm swaps can co-exist with rows encrypted under the
 * current scheme.
 */
export class WebCryptoSecretBox implements SecretBox {
  private cachedKey: Promise<CryptoKey> | null = null;

  constructor(
    private readonly masterKeyBase64: string,
    private readonly subtle: SubtleCrypto = getSubtle(),
  ) {
    // Eagerly validate the shape so a malformed env var fails the
    // container build rather than the first encrypt call.
    decodeMasterKey(masterKeyBase64);
  }

  static fromEnv(env: {
    readonly SECRET_BOX_MASTER_KEY?: string;
  }): WebCryptoSecretBox {
    const raw = env.SECRET_BOX_MASTER_KEY;
    if (raw === undefined) {
      throw new SecretBoxError(
        SecretBoxErrorCode.KeyUnavailable,
        "SECRET_BOX_MASTER_KEY is not set",
      );
    }
    return new WebCryptoSecretBox(raw);
  }

  private getKey(): Promise<CryptoKey> {
    if (this.cachedKey === null) {
      const rawKey = decodeMasterKey(this.masterKeyBase64);
      this.cachedKey = importAesKey(this.subtle, rawKey);
    }
    return this.cachedKey;
  }

  async encrypt(plain: string): Promise<string> {
    const key = await this.getKey();
    const iv = new Uint8Array(IV_BYTES);
    globalThis.crypto.getRandomValues(iv);
    const data = new TextEncoder().encode(plain);
    const ivBuffer = new ArrayBuffer(iv.byteLength);
    new Uint8Array(ivBuffer).set(iv);
    const dataBuffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(dataBuffer).set(data);
    let cipherBuf: ArrayBuffer;
    try {
      cipherBuf = await this.subtle.encrypt(
        { name: "AES-GCM", iv: ivBuffer },
        key,
        dataBuffer,
      );
    } catch (error) {
      throw new SecretBoxError(
        SecretBoxErrorCode.EncryptFailed,
        "AES-GCM encrypt failed",
        error,
      );
    }
    const cipher = new Uint8Array(cipherBuf);
    const out = new Uint8Array(1 + IV_BYTES + cipher.byteLength);
    out[0] = VERSION_V1;
    out.set(iv, 1);
    out.set(cipher, 1 + IV_BYTES);
    return toBase64(out);
  }

  async decrypt(cipher: string): Promise<string> {
    const decoded = fromBase64(cipher);
    if (decoded === null || decoded.length < 1 + IV_BYTES + 16) {
      throw new SecretBoxError(
        SecretBoxErrorCode.InvalidCiphertext,
        "Ciphertext is not valid base64 or is too short",
      );
    }
    if (decoded[0] !== VERSION_V1) {
      throw new SecretBoxError(
        SecretBoxErrorCode.InvalidCiphertext,
        `Unsupported ciphertext version: 0x${decoded[0].toString(16)}`,
      );
    }
    const iv = decoded.slice(1, 1 + IV_BYTES);
    const body = decoded.slice(1 + IV_BYTES);
    const ivBuffer = new ArrayBuffer(iv.byteLength);
    new Uint8Array(ivBuffer).set(iv);
    const bodyBuffer = new ArrayBuffer(body.byteLength);
    new Uint8Array(bodyBuffer).set(body);
    const key = await this.getKey();
    let plainBuf: ArrayBuffer;
    try {
      plainBuf = await this.subtle.decrypt(
        { name: "AES-GCM", iv: ivBuffer },
        key,
        bodyBuffer,
      );
    } catch (error) {
      // AES-GCM raises on tag mismatch (tamper / wrong key) and on
      // any other crypto-level failure. From the caller's perspective
      // both reduce to "this ciphertext is no longer trustworthy".
      throw new SecretBoxError(
        SecretBoxErrorCode.DecryptFailed,
        "AES-GCM decrypt failed (tag mismatch or wrong key)",
        error,
      );
    }
    return new TextDecoder().decode(plainBuf);
  }
}
