/**
 * Returns a chainable Proxy stand-in for `createMiddleware` /
 * `createServerFn` builder chains executed at module top-level when
 * `actions.ts` is loaded. `then` is excluded so accidental `await`
 * does not turn the Proxy into a thenable.
 */
export const serverFnChainStub = (): unknown => {
  const chain = (): unknown =>
    new Proxy(() => chain(), {
      get: (_, prop) => (prop === "then" ? undefined : chain()),
    });
  return chain();
};

/**
 * Identity-dispatching `useServerFn` mock. Pass `[ref, mock]` pairs;
 * the returned function compares by referential equality and returns
 * the paired mock. Unknown fns fall back to `fallback` if provided,
 * else `undefined` so unmocked usage is loud instead of silently
 * passing.
 */
export const useServerFnRouter =
  <T>(entries: ReadonlyArray<readonly [unknown, T]>, fallback?: T) =>
  (fn: unknown): T | undefined => {
    for (const [ref, mock] of entries) if (fn === ref) return mock;
    return fallback;
  };
