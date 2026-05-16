import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import {
  deleteSavedViewSchema,
  renameSavedViewSchema,
  setDefaultSavedViewSchema,
} from "../schema";

export const deleteSavedViewFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(deleteSavedViewSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/view/deleteSavedView"),
    );
    await module.deleteSavedView({
      container,
      input: { actorUserId: actor.id, viewId: data.viewId },
    });
    return { ok: true };
  });

export const setDefaultSavedViewFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(setDefaultSavedViewSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/view/setDefaultSavedView"),
    );
    await module.setDefaultSavedView({
      container,
      input: {
        actorUserId: actor.id,
        kind: data.kind,
        viewId: data.viewId,
      },
    });
    return { ok: true };
  });

export const renameSavedViewFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(renameSavedViewSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/view/updateSavedView"),
    );
    return module.updateSavedView({
      container,
      input: {
        actorUserId: actor.id,
        viewId: data.viewId,
        name: data.name,
      },
    });
  });
