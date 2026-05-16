import {
  TempFileNotFoundError,
  type TempFileStorage,
} from "@/core/domain/ingestion/ports/tempFileStorage";

/**
 * In-memory `TempFileStorage` backed by a `Map`. Mirrors the
 * `R2TempFileStorage` error contract: `get` on a missing key raises
 * `TempFileNotFoundError`; `delete` is idempotent. Tests get
 * round-trippable bytes without binding an R2 stub.
 */
export class FakeTempFileStorage implements TempFileStorage {
  private readonly bytesByKey = new Map<string, ArrayBuffer>();

  async put(key: string, bytes: ArrayBuffer): Promise<void> {
    this.bytesByKey.set(key, bytes);
  }

  async get(key: string): Promise<ArrayBuffer> {
    const bytes = this.bytesByKey.get(key);
    if (bytes === undefined) {
      throw new TempFileNotFoundError(`Temp file not found: ${key}`);
    }
    return bytes;
  }

  async delete(key: string): Promise<void> {
    this.bytesByKey.delete(key);
  }

  has(key: string): boolean {
    return this.bytesByKey.has(key);
  }

  reset(): void {
    this.bytesByKey.clear();
  }
}
