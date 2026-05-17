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
 */
export const D1_BIND_LIMIT_HOST_VARS = 100;

/**
 * Default chunk size used by `selectInChunks`. Sits a comfortable
 * margin below `D1_BIND_LIMIT_HOST_VARS` so callers can layer 1 or 2
 * additional bound parameters (owner id, status, …) onto the same
 * statement without crossing the cap.
 */
export const SAFE_CHUNK_SIZE = 90;

export async function selectInChunks<T>(
  ids: readonly string[],
  runner: (chunk: readonly string[]) => Promise<readonly T[]>,
  chunkSize: number = SAFE_CHUNK_SIZE,
): Promise<readonly T[]> {
  if (ids.length === 0) return [];
  if (chunkSize <= 0) {
    throw new Error(`selectInChunks: chunkSize must be > 0, got ${chunkSize}`);
  }
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const rows = await runner(chunk);
    for (const row of rows) out.push(row);
  }
  return out;
}
