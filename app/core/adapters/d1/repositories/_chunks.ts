/**
 * D1 host-variable limit guard for `IN (...)` predicates.
 *
 * D1 caps prepared-statement host variables at approximately 100 per
 * statement (the underlying SQLite default is 999 but Workers' D1
 * binding tightens it). `inArray(col, [...ids])` translates to one host
 * variable per id, so any read whose id list grows with the data set
 * eventually overflows the cap.
 *
 * `selectInChunks` splits a candidate id list into safely-sized chunks,
 * runs the caller-supplied query once per chunk, and concatenates the
 * results in input chunk order. It performs no deduplication and no
 * cross-chunk sorting — both are the caller's responsibility when the
 * underlying query relied on a `WHERE id IN (...) ORDER BY ...` clause.
 *
 * Chunks are dispatched through a bounded worker pool (default
 * `DEFAULT_MAX_CONCURRENCY`). On first rejection, already-claimed
 * chunks complete and settle; unclaimed chunks are never started.
 */
export const D1_BIND_LIMIT_HOST_VARS = 100;

/**
 * Default chunk size used by `selectInChunks`. Sits a comfortable
 * margin below `D1_BIND_LIMIT_HOST_VARS` so callers can layer 1 or 2
 * additional bound parameters (owner id, status, …) onto the same
 * statement without crossing the cap.
 */
export const SAFE_CHUNK_SIZE = 90;

/**
 * Default upper bound on the number of chunk runners that may be
 * in-flight concurrently. Sits within the DB-connection-pool industry
 * default band (5-10) and acts as a conservative safety margin against
 * Cloudflare Workers' (non-public) subrequest throttling threshold and
 * D1's (non-public) concurrent-connection cap. Rationale and follow-up
 * conditions are recorded in `.issue/172/adr.md` ADR-001.
 */
export const DEFAULT_MAX_CONCURRENCY = 8;

export interface SelectInChunksOptions {
  chunkSize?: number;
  maxConcurrency?: number;
}

/**
 * Split `ids` into chunks of at most `chunkSize`, dispatch them through
 * a bounded worker pool of at most `maxConcurrency` in-flight runners,
 * and return the concatenation of per-chunk results in input chunk
 * order.
 *
 * Bounding the in-flight count prevents the worst-case `Promise.all`
 * fan-out (e.g. 112 chunks for `idScope.size = 10000`) from saturating
 * Cloudflare Workers subrequest throttling or D1's concurrent-connection
 * cap — neither of which is documented as a public numeric threshold.
 * The default of {@link DEFAULT_MAX_CONCURRENCY} (8) sits in the
 * industry-default DB connection-pool band (5-10); see
 * `.issue/172/adr.md` for the full rationale.
 *
 * Caller-side fan-out is **not** bounded by this helper: N concurrent
 * calls to `selectInChunks` observe up to N × maxConcurrency in-flight
 * runners. See `.issue/172/adr.md` ADR-001 §fan-out.
 *
 * Ordering and failure semantics:
 * - The resolved array tracks input chunk order regardless of which
 *   runner settles first (workers write results into a pre-sized array
 *   at their claimed index).
 * - First rejection wins: the function rejects with the first runner
 *   failure. Chunks already in flight at the moment of rejection
 *   continue to completion and their results are discarded. Chunks not
 *   yet claimed by any worker are **never started** because workers
 *   observe the `aborted` flag at the top of each loop iteration. This
 *   differs from the previous `Promise.all` implementation where every
 *   chunk's runner was always invoked. Callers must not rely on runner
 *   side effects firing for every chunk.
 */
export async function selectInChunks<T>(
  ids: readonly string[],
  runner: (chunk: readonly string[]) => Promise<readonly T[]>,
  options?: SelectInChunksOptions,
): Promise<readonly T[]> {
  if (ids.length === 0) return [];
  const chunkSize = options?.chunkSize ?? SAFE_CHUNK_SIZE;
  const maxConcurrency = options?.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
  if (chunkSize <= 0) {
    throw new Error(`selectInChunks: chunkSize must be > 0, got ${chunkSize}`);
  }
  if (maxConcurrency <= 0) {
    throw new Error(
      `selectInChunks: maxConcurrency must be > 0, got ${maxConcurrency}`,
    );
  }
  const chunks: (readonly string[])[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  const results: (readonly T[])[] = new Array(chunks.length);
  let cursor = 0;
  let aborted = false;
  const workers = Array.from(
    { length: Math.min(maxConcurrency, chunks.length) },
    async () => {
      while (!aborted) {
        // cursor++ is safe across workers: JS evaluates the
        // post-increment synchronously before any `await` yields
        // control, so two workers never observe the same index.
        const i = cursor++;
        if (i >= chunks.length) return;
        try {
          results[i] = await runner(chunks[i]);
        } catch (e) {
          // Set `aborted` before re-throwing so sibling workers observe
          // the flag on their next loop iteration and skip claiming
          // further chunks. `Promise.all` rejects on the first thrown
          // worker, so `results.flat()` below is only reached when every
          // worker completed successfully (no sparse slots possible).
          aborted = true;
          throw e;
        }
      }
    },
  );
  await Promise.all(workers);
  return results.flat();
}
