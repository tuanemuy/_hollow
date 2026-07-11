import { createMiddleware } from "@tanstack/react-start";
import { getRequest, getRequestHeader } from "@tanstack/react-start/server";
import { getContainer } from "@/core/application/di/containerStore";
import { ForbiddenError } from "@/core/application/errors";

// Methods that do not change state. CSRF defence is unnecessary for them
// and the browser does not attach an `Origin` header consistently, so we
// skip verification rather than risk false 403s on safe navigations.
const SAFE_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Returns `true` when `candidate` (an `Origin` value or a full `Referer`
 * URL) shares the same origin (scheme + host + port) as `trusted`. A
 * missing or unparsable `candidate` returns `false` — the caller treats
 * that as "not same-origin" and rejects fail-closed.
 */
export function isSameOrigin(
  candidate: string | undefined,
  trusted: string,
): boolean {
  if (candidate === undefined) return false;
  try {
    return new URL(candidate).origin === new URL(trusted).origin;
  } catch {
    return false;
  }
}

/**
 * The origin this request was actually served from, derived from the
 * request URL. Returns `undefined` when the URL is missing/unparsable.
 *
 * A same-origin request is the real CSRF invariant: its `Origin` matches
 * the origin that served it. The configured `appUrl` is only one such
 * origin — in local dev the app is served on different ports by `vite`
 * (`pnpm dev`) and `wrangler` (`pnpm start`), neither of which need match
 * a single static `APP_URL`. Accepting the served origin lets both work
 * without weakening prod: a cross-site attacker sets `Origin` to their own
 * site, but the served origin is fixed by the edge and cannot be forged,
 * so their request still fails the match.
 */
function servedOrigin(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

// Explicit Origin/Referer verification for state-changing server
// functions. `SameSite=lax` session cookies are still sent on top-level
// cross-site POST navigations, so cookie attributes alone do not close
// the CSRF surface on admin destructive endpoints. This middleware reads
// the request's `Origin` (falling back to `Referer`) and rejects any
// state-changing request whose origin does not match the configured app
// URL. The throw is serialized into a 403 by `errorResponseMiddleware`,
// which must wrap this middleware (i.e. appear first in the array).
//
// The `.server(...)` body is stripped from client bundles by the TanStack
// Start compiler, so importing `@tanstack/react-start/server` and
// `getContainer` at module top-level is client-graph safe.
export const csrfMiddleware = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const method = request.method.toUpperCase();
    if (SAFE_METHODS.has(method)) {
      return next();
    }

    const origin = getRequestHeader("origin");
    const { config } = await getContainer();

    // Trusted origins: the configured prod URL plus the origin this request
    // was actually served from (so `pnpm dev`/vite and `pnpm start`/wrangler
    // both pass despite serving on ports that differ from `APP_URL`).
    const served = servedOrigin(request.url);
    const matches = (candidate: string | undefined): boolean =>
      isSameOrigin(candidate, config.appUrl) ||
      (served !== undefined && isSameOrigin(candidate, served));

    // A present `Origin` is authoritative — a forged Origin must never slip
    // through on the strength of a matching Referer. Only when `Origin` is
    // absent or empty do we fall back to `Referer`.
    const ok = origin ? matches(origin) : matches(getRequestHeader("referer"));

    if (!ok) {
      throw new ForbiddenError(
        "FORBIDDEN_CROSS_ORIGIN",
        "Cross-origin request rejected",
      );
    }

    return next();
  },
);
