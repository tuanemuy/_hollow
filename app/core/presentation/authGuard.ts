import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { HOME_SEARCH } from "@/components/auth/links";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

/**
 * Resolve whether the request carries an authenticated session. Lives here
 * (not in `authMiddleware.ts`) because `createServerFn` is isomorphic — its
 * wrapper is referenced from the client bundle, which cannot import the
 * `server-only`-marked `authMiddleware`. The server-only `getCurrentUser`
 * is reached via a dynamic import inside the handler so it never leaks into
 * the client graph.
 */
const checkAuthenticated = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getCurrentUser } = await import(
      "@/core/presentation/authMiddleware"
    );
    const user = await getCurrentUser();
    return { authenticated: user !== null };
  });

/**
 * `beforeLoad` guard for auth-required routes: an unauthenticated request is
 * redirected to `/login` before any loader runs. Guarding at the route
 * boundary keeps a child RSC's `requireCurrentUser()` throw from surfacing as
 * the route's `errorComponent` (the bug fixed in #342).
 */
export async function requireAuthenticatedRoute(): Promise<void> {
  const { authenticated } = await checkAuthenticated();
  if (!authenticated) throw redirect({ to: "/login" });
}

/**
 * `beforeLoad` guard for guest-only routes (login / signup): an already
 * authenticated request is redirected to the home view.
 */
export async function redirectAuthenticatedRoute(): Promise<void> {
  const { authenticated } = await checkAuthenticated();
  if (authenticated) throw redirect({ to: "/", search: HOME_SEARCH });
}
