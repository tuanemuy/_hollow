import type { R2Bucket } from "@cloudflare/workers-types";
import {
  TempFileNotFoundError,
  type TempFileStorage,
  TempFileStorageUnavailableError,
} from "@/core/domain/ingestion/ports/tempFileStorage";

/**
 * R2-backed implementation of {@link TempFileStorage}.
 *
 * Wraps the bound `R2Bucket` provided by the Cloudflare Workers runtime
 * (`env.<binding>`). The DI layer is responsible for choosing the
 * dedicated bucket binding used for ingestion-temp storage so this
 * adapter is decoupled from any specific binding name — multiple
 * adapters can be instantiated against different buckets without code
 * changes.
 *
 * Error contract per the port (`tempFileStorage.ts`):
 * - `get`: missing key surfaces as `TempFileNotFoundError`; transient
 *   backend failure surfaces as `TempFileStorageUnavailableError`.
 * - `put` / `delete`: "already gone" is success (R2 `delete` is
 *   idempotent and we do not assert prior existence). Transient
 *   backend failures surface as `TempFileStorageUnavailableError`.
 *
 * All translation lives in `mapBackendError` so the catch sites stay
 * uniform across operations.
 */
export class R2TempFileStorage implements TempFileStorage {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, bytes: ArrayBuffer): Promise<void> {
    try {
      await this.bucket.put(key, bytes);
    } catch (cause) {
      throw mapBackendError(`Failed to put temp file ${key}`, cause);
    }
  }

  async get(key: string): Promise<ArrayBuffer> {
    let object: Awaited<ReturnType<R2Bucket["get"]>>;
    try {
      object = await this.bucket.get(key);
    } catch (cause) {
      throw mapBackendError(`Failed to fetch temp file ${key}`, cause);
    }
    if (object === null) {
      throw new TempFileNotFoundError(`Temp file not found: ${key}`);
    }
    try {
      return await object.arrayBuffer();
    } catch (cause) {
      throw mapBackendError(`Failed to read temp file body ${key}`, cause);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.bucket.delete(key);
    } catch (cause) {
      throw mapBackendError(`Failed to delete temp file ${key}`, cause);
    }
  }
}

function mapBackendError(
  message: string,
  cause: unknown,
): TempFileStorageUnavailableError {
  return new TempFileStorageUnavailableError(message, cause);
}
