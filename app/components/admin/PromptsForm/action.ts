import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import {
  resetAllPromptTemplatesSchema,
  resetPromptTemplateSchema,
  updatePromptTemplateSchema,
} from "../schema";

export const updatePromptTemplateFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(updatePromptTemplateSchema))
  .handler(async ({ data }) => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/adminSettings/updatePromptTemplate"),
    );
    return module.updatePromptTemplate({
      container,
      input: {
        actorUserId: actor.id,
        purpose: data.purpose,
        template: {
          text: data.text,
          expectedVariables: data.expectedVariables,
        },
      },
    });
  });

export const resetPromptTemplateFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(resetPromptTemplateSchema))
  .handler(async ({ data }) => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/adminSettings/resetPromptTemplate"),
    );
    return module.resetPromptTemplate({
      container,
      input: {
        actorUserId: actor.id,
        purpose: data.purpose,
      },
    });
  });

export const resetAllPromptTemplatesFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(resetAllPromptTemplatesSchema))
  .handler(async () => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/adminSettings/resetAllPromptTemplates"),
    );
    return module.resetAllPromptTemplates({
      container,
      input: { actorUserId: actor.id },
    });
  });
