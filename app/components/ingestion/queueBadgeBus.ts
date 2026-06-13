/**
 * Minimal module-scoped pub-sub for the header queue badge.
 *
 * The AppShell loader is `staleTime: Infinity`, so a server-rendered badge
 * would never refresh after leaf navigations or mutations. Instead the badge
 * is a client component that re-fetches its count on mount, on visibility
 * restore, and whenever an ingestion mutation succeeds — the mutation call
 * sites announce via `notifyIngestionQueueChanged()`. See
 * `.issue/538/adr.md` ADR-002.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/**
 * Registers `listener` and returns its unsubscribe function. Callers MUST
 * unsubscribe on unmount — the registry is module-scoped and outlives any
 * component instance.
 */
export function subscribeIngestionQueueChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Announces that the actor's ingestion queue contents may have changed. */
export function notifyIngestionQueueChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Test-only: clears all subscribers so module-cache residue cannot leak
 * between test files sharing the module instance.
 */
export function resetIngestionQueueBusForTest(): void {
  listeners.clear();
}
