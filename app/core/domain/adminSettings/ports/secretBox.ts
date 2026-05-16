import { CodedError, type SerializedErrorBase } from "@/lib/error";

export type SerializedSecretBoxError = SerializedErrorBase & {
  kind: "secretBox";
};

export const SecretBoxErrorCode = {
  EncryptFailed: "SECRET_BOX_ENCRYPT_FAILED",
  DecryptFailed: "SECRET_BOX_DECRYPT_FAILED",
  InvalidCiphertext: "SECRET_BOX_INVALID_CIPHERTEXT",
  KeyUnavailable: "SECRET_BOX_KEY_UNAVAILABLE",
} as const;

export type SecretBoxErrorCode =
  (typeof SecretBoxErrorCode)[keyof typeof SecretBoxErrorCode];

/**
 * Raised by `SecretBox` implementations when encrypt / decrypt cannot be
 * completed (missing key material, corrupted ciphertext, etc). Adapters
 * translate driver-level crypto failures into this contract so callers
 * never see provider-specific errors.
 */
export class SecretBoxError extends CodedError<SecretBoxErrorCode> {
  override readonly name = "SecretBoxError";

  override toSerialized(): SerializedSecretBoxError {
    return {
      kind: "secretBox",
      code: this.code,
      message: this.message,
      retryable: false,
    };
  }
}

export function isSecretBoxError(error: unknown): error is SecretBoxError {
  return error instanceof SecretBoxError;
}

/**
 * Symmetric envelope encryption port for at-rest secrets (e.g. LLM api
 * keys persisted with `apiKeySource === 'db'`). Implementations choose
 * the crypto primitive (AES-GCM via Web Crypto, KMS, etc); the contract
 * is "round-trip a UTF-8 string through opaque ciphertext".
 */
export interface SecretBox {
  encrypt(plain: string): Promise<string>;
  decrypt(cipher: string): Promise<string>;
}
