import { createServerFn } from "@tanstack/react-start";
import { csrfMiddleware } from "@/core/presentation/csrfMiddleware";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { resetDesignTokensSchema, updateDesignTokensSchema } from "../schema";

export const updateDesignTokensFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware, csrfMiddleware])
  .inputValidator(validateInput(updateDesignTokensSchema))
  .handler(async ({ data }) => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/adminSettings/updateDesignTokens"),
    );
    return module.updateDesignTokens({
      container,
      input: {
        actorUserId: actor.id,
        tokens: data.tokens,
      },
    });
  });

export const resetDesignTokensFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware, csrfMiddleware])
  .inputValidator(validateInput(resetDesignTokensSchema))
  .handler(async () => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/adminSettings/resetDesignTokens"),
    );
    return module.resetDesignTokens({
      container,
      input: { actorUserId: actor.id },
    });
  });
