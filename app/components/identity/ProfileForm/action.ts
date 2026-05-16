import { createServerFn } from "@tanstack/react-start";
import type { MediaAssetId, UserId } from "@/core/application/dto/identity";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { changeUsernameSchema, updateProfileSchema } from "../schema";

export const updateProfileFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(updateProfileSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/updateProfile"),
    );
    // Re-shape so the tri-state semantics (`undefined` vs explicit
    // `null`) reach the usecase intact. Zod's `.optional()` carries
    // `undefined` through, so we forward selectively.
    const input: Parameters<typeof module.updateProfile>[0]["input"] = {
      actorUserId: actor.id as unknown as UserId,
    };
    if (data.displayName !== undefined) input.displayName = data.displayName;
    if (data.bio !== undefined) input.bio = data.bio;
    if (data.avatarMediaId !== undefined) {
      input.avatarMediaId =
        data.avatarMediaId === null
          ? null
          : (data.avatarMediaId as MediaAssetId);
    }
    return module.updateProfile({ container, input });
  });

export const changeUsernameFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(changeUsernameSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/changeUsername"),
    );
    return module.changeUsername({
      container,
      input: {
        actorUserId: actor.id as unknown as UserId,
        newUsername: data.newUsername,
      },
    });
  });
