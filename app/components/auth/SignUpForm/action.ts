import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { signUpSchema } from "../schema";

export const signUpFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(signUpSchema))
  .handler(async ({ data }) => {
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/signUp"),
    );
    return module.signUp({
      container,
      input: {
        username: data.username,
        email: data.email,
        password: data.password,
        displayName: data.displayName,
        acceptTerms: data.acceptTerms,
      },
    });
  });
