import { createServerFn } from "@tanstack/react-start";
import { cache } from "react";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps, serverData } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { previewPromptSchema, updateUserPromptSchema } from "./schema";

export const loadUserPromptOverride = cache(
  serverData(
    () => import("@/core/application/adminSettings/getUserPromptOverride"),
    ({ container }, { getUserPromptOverride }, actorUserId: string) =>
      getUserPromptOverride({ container, input: { actorUserId } }),
  ),
);

export const loadInstancePromptDefaults = cache(
  serverData(
    () => import("@/core/application/adminSettings/getInstancePromptDefaults"),
    ({ container }, { getInstancePromptDefaults }) =>
      getInstancePromptDefaults({ container, input: {} }),
  ),
);

export const updateUserPromptFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(updateUserPromptSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/adminSettings/updateUserPromptOverride"),
    );
    return module.updateUserPromptOverride({
      container,
      input: {
        actorUserId: actor.id,
        purpose: data.purpose,
        template: data.template,
      },
    });
  });

export const previewPromptFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(previewPromptSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/ingestion/previewPrompt"),
    );
    return module.previewPrompt({
      container,
      input: {
        actorUserId: actor.id,
        purpose: data.purpose,
        sampleText: data.sampleText,
        ...(data.overridePrompt !== undefined
          ? { overridePrompt: data.overridePrompt }
          : {}),
      },
    });
  });
