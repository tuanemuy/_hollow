import { createServerFn } from "@tanstack/react-start";
import { cache } from "react";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps, serverData } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { testLLMConnectionSchema, updateLLMConfigSchema } from "../schema";

export const loadInstanceSettings = cache(
  serverData(
    () => import("@/core/application/adminSettings/getInstanceSettings"),
    ({ container }, { getInstanceSettings }, actorUserId: string) =>
      getInstanceSettings({ container, input: { actorUserId } }),
  ),
);

export const updateLLMConfigFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(updateLLMConfigSchema))
  .handler(async ({ data }) => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/adminSettings/updateLLMConfig"),
    );
    return module.updateLLMConfig({
      container,
      input: {
        actorUserId: actor.id,
        model: data.model,
        apiKeyPlain: data.apiKeyPlain,
      },
    });
  });

export const testLLMConnectionFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(testLLMConnectionSchema))
  .handler(async ({ data }) => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/adminSettings/testLLMConnection"),
    );
    return module.testLLMConnection({
      container,
      input: {
        actorUserId: actor.id,
        useDraft: data.useDraft,
        draftConfig: data.draftConfig,
      },
    });
  });
