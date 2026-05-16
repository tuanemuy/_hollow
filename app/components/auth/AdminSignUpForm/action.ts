import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { adminSignUpSchema } from "../schema";

export const adminSignUpFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(adminSignUpSchema))
  .handler(async ({ data }) => {
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/adminSignUp"),
    );
    return module.adminSignUp({
      container,
      input: {
        username: data.username,
        email: data.email,
        password: data.password,
        displayName: data.displayName,
        setupToken: data.setupToken,
        acceptTerms: data.acceptTerms,
      },
    });
  });
