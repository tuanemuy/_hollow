import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { requireCurrentUser } from "@/lib/server/currentUser";
import {
  createDirectorySchema,
  deleteDirectorySchema,
  moveDirectorySchema,
  renameDirectorySchema,
} from "./schema";

export const createDirectoryFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(createDirectorySchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/directory/createDirectory"),
    );
    return module.createDirectory({
      container,
      input: {
        actorUserId: user.id as unknown as string,
        parentId: data.parentId,
        name: data.name,
      },
    });
  });

export const renameDirectoryFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(renameDirectorySchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/directory/renameDirectory"),
    );
    return module.renameDirectory({
      container,
      input: {
        actorUserId: user.id as unknown as string,
        directoryId: data.directoryId,
        newName: data.newName,
      },
    });
  });

export const moveDirectoryFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(moveDirectorySchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/directory/moveDirectory"),
    );
    return module.moveDirectory({
      container,
      input: {
        actorUserId: user.id as unknown as string,
        directoryId: data.directoryId,
        newParentId: data.newParentId,
      },
    });
  });

export const deleteDirectoryFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(deleteDirectorySchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/directory/deleteDirectory"),
    );
    return module.deleteDirectory({
      container,
      input: {
        actorUserId: user.id as unknown as string,
        directoryId: data.directoryId,
      },
    });
  });
