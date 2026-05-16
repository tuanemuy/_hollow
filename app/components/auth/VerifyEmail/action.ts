import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { setSessionCookie } from "@/core/presentation/authMiddleware";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { resendVerificationSchema, tokenOnlySchema } from "../schema";

export const verifyEmailFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(tokenOnlySchema))
  .handler(async ({ data }) => {
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/verifyEmail"),
    );
    const userAgent = getRequestHeader("user-agent") ?? null;
    const result = await module.verifyEmail({
      container,
      input: { token: data.token, userAgent, ipAddress: null },
    });
    setSessionCookie(result.sessionToken, new Date(result.expiresAt));
    return { userId: result.userId };
  });

export const resendVerificationFromVerifyFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(resendVerificationSchema))
  .handler(async ({ data }) => {
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/resendVerification"),
    );
    await module.resendVerification({
      container,
      input: { email: data.email },
    });
    return { ok: true } as const;
  });
