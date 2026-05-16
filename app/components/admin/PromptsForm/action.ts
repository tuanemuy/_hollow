import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { updatePromptTemplateSchema } from "../schema";

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
