import { createServerFn } from "@tanstack/react-start";
import { clearSessionCookie } from "@/core/presentation/authMiddleware";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { getCurrentSessionToken } from "@/lib/server/currentUser";

/**
 * Revoke the caller's session and clear the session cookie. Reuses the
 * `logOut` usecase (idempotent `revoke`). When no session cookie is present
 * the request is already unauthenticated, so the usecase call is skipped and
 * only the cookie is cleared. The redirect to `/login` is performed
 * client-side (see `.issue/239/adr.md` ADR-001) to mirror the login flow and
 * guarantee the cached `_app` loader is invalidated.
 *
 * This server function is reached only through the dynamically-imported
 * `Sidebar` → `UserMenu` (client component) chain in `routes/_app/route.tsx`,
 * which the RSC build does not traverse statically. Without an explicit
 * side-effect `import "@/components/layout/logOutAction"` in that server-graph
 * route, the RSC manifest never registers this handler and the client RPC
 * stub resolves to "Server function info not found" → HTTP 500 (logout
 * failed in production; see #718). The dedicated module mirrors the other
 * `action.ts` server-fn files and gives that route a stable thing to import.
 */
export const logOutFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const token = getCurrentSessionToken();
    if (token !== null) {
      const { container, module } = await loadServerDeps(
        () => import("@/core/application/identity/logOut"),
      );
      await module.logOut({ container, input: { sessionToken: token } });
    }
    clearSessionCookie();
    return { ok: true } as const;
  });
