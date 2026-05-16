/**
 * Storage port for binary objects backing media assets. The MVP adapter
 * targets Cloudflare R2; other backends (`s3`, `github`) plug into the
 * same port without touching domain code.
 *
 * Errors are surfaced as concrete classes so adapters can translate
 * provider-native exceptions into a shared contract that callers can
 * `instanceof`-check at presentation boundaries. The classes live in
 * the domain because they are part of the port contract; adapter
 * implementations import them rather than re-declaring.
 */

export class StorageNotFoundError extends Error {
  override readonly name = "StorageNotFoundError";

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isStorageNotFoundError(
  error: unknown,
): error is StorageNotFoundError {
  return error instanceof StorageNotFoundError;
}

export class StorageUnavailableError extends Error {
  override readonly name = "StorageUnavailableError";

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isStorageUnavailableError(
  error: unknown,
): error is StorageUnavailableError {
  return error instanceof StorageUnavailableError;
}

/**
 * Lightweight metadata for an object — size and content type only. Used
 * by `FinalizeUpload` to reconcile the persisted `MediaAsset` row with
 * the actual bytes the client uploaded against a presigned URL, without
 * paying the cost of streaming the whole body back through the worker.
 */
export type ObjectMetadata = Readonly<{
  byteSize: number;
  contentType: string;
}>;

export interface ObjectStorage {
  /**
   * Upload `bytes` to the configured backend at `key`. Implementations
   * overwrite existing objects at the same key.
   */
  put(key: string, bytes: ArrayBuffer, contentType: string): Promise<void>;

  /**
   * Fetch the object at `key`. Throws `StorageNotFoundError` if the key
   * does not exist and `StorageUnavailableError` for transient backend
   * failures.
   */
  get(key: string): Promise<ArrayBuffer>;

  /**
   * Fetch size + content-type metadata for the object at `key` without
   * downloading the body. Throws `StorageNotFoundError` if the key does
   * not exist and `StorageUnavailableError` for transient backend
   * failures.
   */
  stat(key: string): Promise<ObjectMetadata>;

  /**
   * Remove the object at `key`. Implementations treat "already gone"
   * as success; only transient backend failures surface as
   * `StorageUnavailableError`.
   */
  delete(key: string): Promise<void>;

  /**
   * Issue a short-lived presigned URL for downloading the object at
   * `key`. The caller is responsible for any access-control checks
   * (e.g. `MediaService.assertViewableBy`) before invoking this port.
   */
  presignDownload(key: string, ttlSec: number): Promise<URL>;

  /**
   * Issue a short-lived presigned URL for uploading to `key`. The
   * caller pins the `contentType` so the backend can enforce it on the
   * PUT.
   */
  presignUpload(key: string, contentType: string, ttlSec: number): Promise<URL>;
}
