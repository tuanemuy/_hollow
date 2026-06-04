import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { deleteAccountSchema } from "../schema";

export const deleteAccountFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(deleteAccountSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/deleteAccount"),
    );
    await module.deleteAccount({
      container,
      input: {
        actorUserId: actor.id,
        confirmation: data.confirmation,
      },
    });
    return { ok: true };
  });
