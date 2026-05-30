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
 * URL) shares the same origin (scheme + host + port) as `appUrl`. A
 * missing or unparsable `candidate` returns `false` — the caller treats
 * that as "not same-origin" and rejects fail-closed.
 */
export function isSameOrigin(
  candidate: string | undefined,
  appUrl: string,
): boolean {
  if (candidate === undefined) return false;
  try {
    return new URL(candidate).origin === new URL(appUrl).origin;
  } catch {
    return false;
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
    const method = getRequest().method.toUpperCase();
    if (SAFE_METHODS.has(method)) {
      return next();
    }

    const origin = getRequestHeader("origin");
    const referer = getRequestHeader("referer");
    const { config } = await getContainer();

    const ok =
      origin !== undefined
        ? isSameOrigin(origin, config.appUrl)
        : isSameOrigin(referer, config.appUrl);

    if (!ok) {
      throw new ForbiddenError(
        "FORBIDDEN_CROSS_ORIGIN",
        "Cross-origin request rejected",
      );
    }

    return next();
  },
);
