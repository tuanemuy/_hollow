import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { setSessionCookie } from "@/core/presentation/authMiddleware";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { passwordResetConfirmSchema } from "../schema";

export const resetPasswordFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(passwordResetConfirmSchema))
  .handler(async ({ data }) => {
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/resetPassword"),
    );
    const userAgent = getRequestHeader("user-agent") ?? null;
    const result = await module.resetPassword({
      container,
      input: {
        token: data.token,
        newPassword: data.newPassword,
        userAgent,
        ipAddress: null,
      },
    });
    setSessionCookie(result.sessionToken, new Date(result.expiresAt));
    return { userId: result.userId };
  });
