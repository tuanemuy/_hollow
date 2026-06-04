import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { requireCurrentUser } from "@/lib/server/currentUser";
import {
  createTagSchema,
  deleteTagSchema,
  mergeTagsSchema,
  renameTagSchema,
} from "./schema";

export const createTagFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(createTagSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/tag/createTag"),
    );
    const { tag } = await module.createTag({
      container,
      input: {
        actorUserId: user.id,
        name: data.name,
      },
    });
    return { tagId: tag.id };
  });

export const renameTagFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(renameTagSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/tag/renameTag"),
    );
    const { tag } = await module.renameTag({
      container,
      input: {
        actorUserId: user.id,
        tagId: data.tagId,
        newName: data.newName,
      },
    });
    return { tagId: tag.id };
  });

export const mergeTagsFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(mergeTagsSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/tag/mergeTags"),
    );
    const result = await module.mergeTags({
      container,
      input: {
        actorUserId: user.id,
        sourceTagId: data.sourceTagId,
        targetTagId: data.targetTagId,
      },
    });
    return { affectedCount: result.affectedNoteIds.length };
  });

export const deleteTagFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(deleteTagSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/tag/deleteTag"),
    );
    const result = await module.deleteTag({
      container,
      input: {
        actorUserId: user.id,
        tagId: data.tagId,
      },
    });
    return { affectedCount: result.affectedNoteIds.length };
  });
