import { createServerFn } from "@tanstack/react-start";
import type { UserId } from "@/core/application/dto/identity";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import {
  changePasswordSchema,
  requestEmailChangeSchema,
  revokeAllOtherSessionsSchema,
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
        actorUserId: actor.id as unknown as UserId,
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
        actorUserId: actor.id as unknown as UserId,
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
        actorUserId: actor.id as unknown as UserId,
        currentSessionToken: token,
      },
    });
  });
