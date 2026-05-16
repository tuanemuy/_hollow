import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { tokenOnlySchema } from "../schema";

export const verifyEmailChangeFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(tokenOnlySchema))
  .handler(async ({ data }) => {
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/verifyEmailChange"),
    );
    const result = await module.verifyEmailChange({
      container,
      input: { token: data.token },
    });
    return { userId: result.userId };
  });
