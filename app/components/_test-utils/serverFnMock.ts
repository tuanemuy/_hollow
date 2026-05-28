/**
 * Returns a chainable Proxy stand-in for `createMiddleware` /
 * `createServerFn` builder chains executed at module top-level when
 * `actions.ts` is loaded.
 *
 * Only `property access → call` chains are supported (e.g.
 * `createServerFn(...).middleware([...]).validator(...).handler(...)`).
 * `.bind` / `.call` / `Symbol.iterator` and similar non-property uses
 * fall through to the underlying anonymous function and won't keep
 * chaining; the current TanStack Start builder API doesn't need them.
 * `then` is also excluded so an accidental `await` doesn't turn the
 * Proxy into a thenable.
 */
export const serverFnChainStub = (): unknown => {
  const chain = (): unknown =>
    new Proxy(() => chain(), {
      get: (_, prop) => (prop === "then" ? undefined : chain()),
    });
  return chain();
};

/**
 * Identity-dispatching `useServerFn` mock.
 *
 * Each `entries[i]` is a `[ref, mock]` pair where `ref` is the same
 * value the SUT passes to `useServerFn(<ref>)` — i.e. the import that
 * `vi.mock("../actions", ...)` has already replaced with `mock`. The
 * returned function compares by referential equality and yields the
 * paired mock.
 *
 * Unmatched lookups throw, so a server fn that slipped past the test
 * setup fails loudly instead of silently rendering `undefined(...)`.
 * Use the second overload when the SUT only ever calls one server fn
 * and threading per-call entries is overkill.
 */
export function useServerFnRouter<T>(
  entries: ReadonlyArray<readonly [unknown, T]>,
): (fn: unknown) => T;
export function useServerFnRouter<T>(
  entries: ReadonlyArray<readonly [unknown, T]>,
  fallback: T,
): (fn: unknown) => T;
export function useServerFnRouter<T>(
  entries: ReadonlyArray<readonly [unknown, T]>,
  fallback?: T,
): (fn: unknown) => T {
  return (fn: unknown): T => {
    for (const [ref, mock] of entries) if (fn === ref) return mock;
    if (fallback !== undefined) return fallback;
    throw new Error(
      "useServerFnRouter: unmocked server fn dispatched. Add an entry or pass a fallback.",
    );
  };
}
