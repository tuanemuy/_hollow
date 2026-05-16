/**
 * Short-lived blob storage backing `IngestionJob.tempStorageKey`. The
 * worker stages the raw upload here while it is being processed; on
 * commit / discard the entry is reclaimed.
 *
 * Errors mirror the `ObjectStorage` port in the Media domain: lookup
 * misses raise `TempFileNotFoundError`, transient backend failures
 * raise `TempFileStorageUnavailableError`. Both are domain-level
 * because they form part of the port contract.
 */

export class TempFileNotFoundError extends Error {
  override readonly name = "TempFileNotFoundError";

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isTempFileNotFoundError(
  error: unknown,
): error is TempFileNotFoundError {
  return error instanceof TempFileNotFoundError;
}

export class TempFileStorageUnavailableError extends Error {
  override readonly name = "TempFileStorageUnavailableError";

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isTempFileStorageUnavailableError(
  error: unknown,
): error is TempFileStorageUnavailableError {
  return error instanceof TempFileStorageUnavailableError;
}

export interface TempFileStorage {
  /**
   * Stages `bytes` under `key`. Implementations overwrite existing
   * entries at the same key.
   */
  put(key: string, bytes: ArrayBuffer): Promise<void>;

  /**
   * Fetches the bytes previously staged at `key`. Throws
   * `TempFileNotFoundError` if the key does not exist (or has been
   * reclaimed) and `TempFileStorageUnavailableError` for transient
   * backend failures.
   */
  get(key: string): Promise<ArrayBuffer>;

  /**
   * Removes the entry at `key`. Implementations treat "already gone"
   * as success; only transient backend failures surface as
   * `TempFileStorageUnavailableError`.
   */
  delete(key: string): Promise<void>;
}
