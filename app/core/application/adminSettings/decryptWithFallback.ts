import {
  isSecretBoxError,
  type SecretBox,
  SecretBoxErrorCode,
} from "@/core/domain/adminSettings/ports/secretBox";

/**
 * Decrypt a ciphertext under the current master key, falling back to the
 * previous master key during a key rotation.
 *
 * Rotation strategy keeps the AES-GCM wire format unchanged (version byte
 * `0x01`); the only thing that changes is the key. A row encrypted under
 * the outgoing key therefore surfaces as a tag mismatch — `DecryptFailed`
 * — when decrypted under the new key. This helper retries such rows under
 * `boxPrevious` (when supplied), so:
 *
 * - the consumer worker keeps decrypting db-source LLM keys mid-rotation
 *   (rather than silently degrading to Stub adapters), and
 * - the admin re-encrypt usecase can read the old-key plaintext before
 *   rewriting it under the new key.
 *
 * Fallback is intentionally narrow:
 *
 * - only `DecryptFailed` (tag mismatch) triggers the previous-key retry.
 *   `InvalidCiphertext` (corrupt / unsupported version byte) and any other
 *   error are not key-generation signals, so they propagate unchanged.
 * - when `boxPrevious` is `null`, the original (current-key) error
 *   propagates — there is no other key to try.
 *
 * The helper never decides policy: it either returns the plaintext or
 * throws. Callers that want to tolerate failure (e.g. the consumer's
 * Stub-downgrade path) wrap it in their own `try/catch`.
 */
export async function decryptWithFallback(
  box: SecretBox,
  boxPrevious: SecretBox | null,
  cipher: string,
): Promise<string> {
  try {
    return await box.decrypt(cipher);
  } catch (error) {
    if (
      boxPrevious !== null &&
      isSecretBoxError(error) &&
      error.code === SecretBoxErrorCode.DecryptFailed
    ) {
      return boxPrevious.decrypt(cipher);
    }
    throw error;
  }
}
