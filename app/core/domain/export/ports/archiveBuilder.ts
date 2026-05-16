/**
 * Raised when the archive builder cannot assemble the supplied file
 * stream into a ZIP. Adapters wrap provider-native errors in this
 * class so usecases see a stable contract.
 */
export class ArchiveError extends Error {
  override readonly name = "ArchiveError";

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isArchiveError(error: unknown): error is ArchiveError {
  return error instanceof ArchiveError;
}

/**
 * Single file entry streamed into the archive. `path` is the
 * archive-relative POSIX path (forward-slash separated). The MVP
 * implementation is expected to keep memory bounded by consuming the
 * iterable lazily.
 */
export type ArchiveEntry = Readonly<{
  path: string;
  bytes: ArrayBuffer;
}>;

export interface ArchiveBuilder {
  createZip(files: AsyncIterable<ArchiveEntry>): Promise<ArrayBuffer>;
}
