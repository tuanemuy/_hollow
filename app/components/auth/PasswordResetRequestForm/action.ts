import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { passwordResetRequestSchema } from "../schema";

export const requestPasswordResetFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(passwordResetRequestSchema))
  .handler(async ({ data }) => {
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/requestPasswordReset"),
    );
    await module.requestPasswordReset({
      container,
      input: { email: data.email },
    });
    return { ok: true } as const;
  });
