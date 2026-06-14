import { createServerFn } from "@tanstack/react-start";
import { cache } from "react";
import { csrfMiddleware } from "@/core/presentation/csrfMiddleware";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps, serverData } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import {
  testSpeechConnectionSchema,
  updateSpeechConfigSchema,
} from "../schema";

export const loadInstanceSettings = cache(
  serverData(
    () => import("@/core/application/adminSettings/getInstanceSettings"),
    ({ container }, { getInstanceSettings }, actorUserId: string) =>
      getInstanceSettings({ container, input: { actorUserId } }),
  ),
);

export const updateSpeechConfigFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware, csrfMiddleware])
  .inputValidator(validateInput(updateSpeechConfigSchema))
  .handler(async ({ data }) => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/adminSettings/updateSpeechConfig"),
    );
    return module.updateSpeechConfig({
      container,
      input: {
        actorUserId: actor.id,
        provider: data.provider,
        model: data.model,
        apiKeyPlain: data.apiKeyPlain,
      },
    });
  });

export const testSpeechConnectionFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware, csrfMiddleware])
  .inputValidator(validateInput(testSpeechConnectionSchema))
  .handler(async ({ data }) => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/adminSettings/testSpeechConnection"),
    );
    return module.testSpeechConnection({
      container,
      input: {
        actorUserId: actor.id,
        useDraft: data.useDraft,
        draftConfig: data.draftConfig,
      },
    });
  });
