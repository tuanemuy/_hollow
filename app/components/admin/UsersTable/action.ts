import { createServerFn } from "@tanstack/react-start";
import { cache } from "react";
import {
  toUserDTO,
  type UserDTO,
  type UserId as UserIdDTO,
} from "@/core/application/dto/identity";
import { csrfMiddleware } from "@/core/presentation/csrfMiddleware";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps, serverData } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { targetUserSchema } from "../schema";

const USER_LIST_LIMIT = 100;

/**
 * Read-only admin-side projection of `userRepository.listAll`. Lives at
 * the presentation layer because there is no dedicated usecase for it;
 * the admin guard already ran in the page server component before
 * `loadAdminUsers` is invoked, so authorisation re-check is unnecessary.
 *
 * Returns DTOs (not entities) so the result is safe to embed in the
 * RSC payload — no domain branded ids cross the boundary.
 */
export const loadAdminUsers = cache(
  serverData(
    async () => ({}),
    async ({ container }): Promise<{ users: readonly UserDTO[] }> => {
      const users = await container.unitOfWorkProvider.run(
        async ({ userRepository }) =>
          userRepository.listAll({ limit: USER_LIST_LIMIT }),
      );
      return { users: users.map(toUserDTO) };
    },
  ),
);

// The DTO `UserId` brand is the cross-layer wire shape — identity
// usecases accept it directly. `User.id` on the domain side carries the
// domain brand, but the two are structurally `string` and the DTO
// boundary is the canonical bridge.
function toUserIdDTO(value: string): UserIdDTO {
  return value as UserIdDTO;
}

export const suspendUserFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware, csrfMiddleware])
  .inputValidator(validateInput(targetUserSchema))
  .handler(async ({ data }) => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/suspendUser"),
    );
    await module.suspendUser({
      container,
      input: {
        actorAdminId: toUserIdDTO(actor.id),
        targetUserId: toUserIdDTO(data.targetUserId),
      },
    });
    return {};
  });

export const reinstateUserFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware, csrfMiddleware])
  .inputValidator(validateInput(targetUserSchema))
  .handler(async ({ data }) => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/reinstateUser"),
    );
    await module.reinstateUser({
      container,
      input: {
        actorAdminId: toUserIdDTO(actor.id),
        targetUserId: toUserIdDTO(data.targetUserId),
      },
    });
    return {};
  });

export const promoteUserFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware, csrfMiddleware])
  .inputValidator(validateInput(targetUserSchema))
  .handler(async ({ data }) => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/promoteUserToAdmin"),
    );
    await module.promoteUserToAdmin({
      container,
      input: {
        actorAdminId: toUserIdDTO(actor.id),
        targetUserId: toUserIdDTO(data.targetUserId),
      },
    });
    return {};
  });

export const demoteUserFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware, csrfMiddleware])
  .inputValidator(validateInput(targetUserSchema))
  .handler(async ({ data }) => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/identity/demoteAdmin"),
    );
    await module.demoteAdmin({
      container,
      input: {
        actorAdminId: toUserIdDTO(actor.id),
        targetUserId: toUserIdDTO(data.targetUserId),
      },
    });
    return {};
  });
