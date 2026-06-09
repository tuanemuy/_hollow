import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import {
  changePasswordSchema,
  requestEmailChangeSchema,
  revokeAllOtherSessionsSchema,
  revokeSessionSchema,
} from "../schema";

export const changePasswordFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(changePasswordSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser, getCurrentSessionToken } = await import(
      "@/lib/server/currentUser"
    );
    const actor = await requireCurrentUser();
    const token = getCurrentSessionToken();
    if (token === null) {
      // The caller went through `requireCurrentUser`, so a session
      // cookie must have been present at the start of the request.
      // Reaching here means the cookie was stripped between resolve
      // and this call — treat as expired.
      const { AuthenticationError } = await import("@/core/application/errors");
      throw new AuthenticationError(
        "invalid_credentials",
        "Session token missing from request",
      );
    }
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/changePassword"),
    );
    await module.changePassword({
      container,
      input: {
        actorUserId: actor.id,
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        revokeOtherSessions: data.revokeOtherSessions,
        currentSessionToken: token,
      },
    });
    return { ok: true };
  });

export const requestEmailChangeFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(requestEmailChangeSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/requestEmailChange"),
    );
    await module.requestEmailChange({
      container,
      input: {
        actorUserId: actor.id,
        newEmail: data.newEmail,
        currentPassword: data.currentPassword,
      },
    });
    return { ok: true };
  });

export const revokeAllOtherSessionsFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(revokeAllOtherSessionsSchema))
  .handler(async () => {
    const { requireCurrentUser, getCurrentSessionToken } = await import(
      "@/lib/server/currentUser"
    );
    const actor = await requireCurrentUser();
    const token = getCurrentSessionToken();
    if (token === null) {
      const { AuthenticationError } = await import("@/core/application/errors");
      throw new AuthenticationError(
        "invalid_credentials",
        "Session token missing from request",
      );
    }
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/revokeAllOtherSessions"),
    );
    return module.revokeAllOtherSessions({
      container,
      input: {
        actorUserId: actor.id,
        currentSessionToken: token,
      },
    });
  });

export const revokeSessionFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(revokeSessionSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    // Owner-scoped, id-based revocation — no session token needed; the
    // actor identity is sufficient (see `.issue/572/adr.md` ADR-001).
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/revokeUserSession"),
    );
    await module.revokeUserSession({
      container,
      input: {
        actorUserId: actor.id,
        sessionId: data.sessionId,
      },
    });
    return { ok: true };
  });
