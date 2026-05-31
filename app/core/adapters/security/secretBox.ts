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

/**
 * `SecretBox` placeholder for dev / staging fallback when
 * `SECRET_BOX_MASTER_KEY` is not configured. Both operations reject
 * with `KeyUnavailable` so the admin UI can still render — the failure
 * only surfaces when an operator actually tries to encrypt / decrypt a
 * secret (e.g. saving a DB-sourced LLM api key).
 *
 * Reached only via {@link selectSecretBox} with `requireKey: false`. In
 * a key-required environment (`requireKey: true`) `selectSecretBox`
 * fails fast instead of falling back here, so this class is unreachable
 * in production.
 */
export class NullSecretBox implements SecretBox {
  async encrypt(_plain: string): Promise<string> {
    throw new SecretBoxError(
      SecretBoxErrorCode.KeyUnavailable,
      "SECRET_BOX_MASTER_KEY is not configured",
    );
  }

  async decrypt(_cipher: string): Promise<string> {
    throw new SecretBoxError(
      SecretBoxErrorCode.KeyUnavailable,
      "SECRET_BOX_MASTER_KEY is not configured",
    );
  }
}

/**
 * The base64 32-byte placeholder shipped in `.dev.vars.example` for
 * `SECRET_BOX_MASTER_KEY`. It decodes to a valid AES-256 key shape, so
 * `decodeMasterKey` accepts it and a copy-paste into a real stage secret
 * would NOT be caught by the shape check alone. {@link selectSecretBox}
 * therefore refuses this exact value in key-required environments.
 *
 * Keep this in sync with the `SECRET_BOX_MASTER_KEY` line in
 * `.dev.vars.example` (verified by a test) and with the duplicated copy in
 * `infra/scripts/placeholderGuard.ts` (the `infra` workspace cannot import
 * this module, so the value is intentionally mirrored there).
 */
export const SHIPPED_DEV_PLACEHOLDER_KEY =
  "ZGV2LW9ubHktZG8tbm90LXVzZS1pbi1wcm9kLWRvLTE=";

export type SelectSecretBoxOptions = { requireKey: boolean };

/**
 * Select the `SecretBox` implementation for an environment.
 *
 * - dev / staging (`requireKey: false`): an unset / blank master key
 *   falls back to {@link NullSecretBox} so the app still boots and only
 *   fails at the first encrypt / decrypt. The shipped dev placeholder is
 *   accepted here for local convenience.
 * - key-required environments such as production (`requireKey: true`):
 *   an unset / blank master key, or the shipped dev placeholder, throws
 *   `SecretBoxError(KeyUnavailable)` at container build so the operator
 *   misconfiguration surfaces at boot rather than silently as runtime
 *   decrypt failures.
 *
 * A present, non-placeholder key always constructs a
 * {@link WebCryptoSecretBox}; a malformed key (non-base64 / wrong byte
 * length) still throws eagerly in that constructor.
 */
export function selectSecretBox(
  env: { readonly SECRET_BOX_MASTER_KEY?: string | undefined },
  opts: SelectSecretBoxOptions,
): SecretBox {
  const raw = env.SECRET_BOX_MASTER_KEY;
  if (raw === undefined || raw.trim().length === 0) {
    if (opts.requireKey) {
      throw new SecretBoxError(
        SecretBoxErrorCode.KeyUnavailable,
        "SECRET_BOX_MASTER_KEY is required in this environment but is unset",
      );
    }
    return new NullSecretBox();
  }
  if (opts.requireKey && raw.trim() === SHIPPED_DEV_PLACEHOLDER_KEY) {
    throw new SecretBoxError(
      SecretBoxErrorCode.KeyUnavailable,
      "refusing the shipped dev placeholder for SECRET_BOX_MASTER_KEY in a key-required environment",
    );
  }
  return new WebCryptoSecretBox(raw);
}

/**
 * Select the previous-master-key `SecretBox` for a master-key rotation.
 *
 * `SECRET_BOX_MASTER_KEY_PREVIOUS` is a *temporary* secret present only
 * during a rotation window (see `.issue/370/adr.md` ADR-003): the
 * operator puts the outgoing key here so rows still encrypted under it
 * can be decrypted (consumer fallback) and re-encrypted under the new
 * master key (admin re-encrypt usecase). Once re-encryption completes
 * the secret is deleted.
 *
 * - unset / blank → `null` (the common, non-rotation case). Unlike
 *   `selectSecretBox` there is no `requireKey` axis: the previous key is
 *   never mandatory, so its absence is not an error.
 * - the shipped dev placeholder → throws `SecretBoxError(KeyUnavailable)`.
 *   A previous key is operator-supplied during rotation; the placeholder
 *   would never be a legitimate value here, so reject it eagerly to catch
 *   a copy-paste mistake.
 * - a present, non-placeholder key → `WebCryptoSecretBox` (its
 *   constructor still throws eagerly on a malformed key shape).
 */
export function selectPreviousSecretBox(env: {
  readonly SECRET_BOX_MASTER_KEY_PREVIOUS?: string | undefined;
}): SecretBox | null {
  const raw = env.SECRET_BOX_MASTER_KEY_PREVIOUS;
  if (raw === undefined || raw.trim().length === 0) {
    return null;
  }
  if (raw.trim() === SHIPPED_DEV_PLACEHOLDER_KEY) {
    throw new SecretBoxError(
      SecretBoxErrorCode.KeyUnavailable,
      "refusing the shipped dev placeholder for SECRET_BOX_MASTER_KEY_PREVIOUS",
    );
  }
  return new WebCryptoSecretBox(raw);
}
