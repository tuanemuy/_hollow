import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { toggleRegistrationPolicySchema } from "../schema";

export const toggleRegistrationPolicyFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(toggleRegistrationPolicySchema))
  .handler(async ({ data }) => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/adminSettings/toggleRegistrationPolicy"),
    );
    return module.toggleRegistrationPolicy({
      container,
      input: {
        actorUserId: actor.id,
        open: data.open,
        closedReason: data.closedReason,
      },
    });
  });
