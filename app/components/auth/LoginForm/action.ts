import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { setSessionCookie } from "@/core/presentation/authMiddleware";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { loginSchema, resendVerificationSchema } from "../schema";

export const loginFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(loginSchema))
  .handler(async ({ data }) => {
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/logIn"),
    );
    const userAgent = getRequestHeader("user-agent") ?? null;
    const result = await module.logIn({
      container,
      input: {
        email: data.email,
        password: data.password,
        userAgent,
        ipAddress: null,
      },
    });
    setSessionCookie(result.sessionToken, new Date(result.expiresAt));
    return { userId: result.userId };
  });

export const resendVerificationFn = createServerFn({ method: "POST" })
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
