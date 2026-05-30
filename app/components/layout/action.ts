import { createServerFn } from "@tanstack/react-start";
import { cache } from "react";
import { clearSessionCookie } from "@/core/presentation/authMiddleware";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps, serverData } from "@/core/presentation/serverAction";
import { getCurrentSessionToken } from "@/lib/server/currentUser";

export const loadDirectoryTree = cache(
  serverData(
    () => import("@/core/application/directory/getDirectoryTree"),
    ({ container }, { getDirectoryTree }, actorUserId: string) =>
      getDirectoryTree({ container, input: { actorUserId } }),
  ),
);

/**
 * Revoke the caller's session and clear the session cookie. Reuses the
 * `logOut` usecase (idempotent `revoke`). When no session cookie is present
 * the request is already unauthenticated, so the usecase call is skipped and
 * only the cookie is cleared. The redirect to `/login` is performed
 * client-side (see `.issue/239/adr.md` ADR-001) to mirror the login flow and
 * guarantee the cached `_app` loader is invalidated.
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
