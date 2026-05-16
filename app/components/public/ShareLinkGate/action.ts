import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { resolveShareLinkSchema } from "../schema";

export const resolveShareLinkFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(resolveShareLinkSchema))
  .handler(async ({ data }) => {
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/publication/resolveShareLink"),
    );
    return module.resolveShareLink({
      container,
      input: {
        token: data.token,
        password: data.password,
        viewerIpHash: null,
      },
    });
  });
