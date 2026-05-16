import { createServerFn } from "@tanstack/react-start";
import type { UserId as UserIdDTO } from "@/core/application/dto/identity";
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

// Domain `UserId` and DTO `UserId` carry distinct brand symbols even
// though both reduce to `string` at runtime. The cast below crosses the
// boundary explicitly — the value is identical, only the brand changes.
const toDtoUserId = (
  id: import("@/core/domain/identity/valueObject").UserId,
): UserIdDTO => id as unknown as UserIdDTO;

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
        actorUserId: toDtoUserId(user.id),
        name: data.name,
      },
    });
    return { tagId: tag.id as unknown as string };
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
        actorUserId: toDtoUserId(user.id),
        tagId: data.tagId as unknown as Parameters<
          typeof module.renameTag
        >[0]["input"]["tagId"],
        newName: data.newName,
      },
    });
    return { tagId: tag.id as unknown as string };
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
        actorUserId: toDtoUserId(user.id),
        sourceTagId: data.sourceTagId as unknown as Parameters<
          typeof module.mergeTags
        >[0]["input"]["sourceTagId"],
        targetTagId: data.targetTagId as unknown as Parameters<
          typeof module.mergeTags
        >[0]["input"]["targetTagId"],
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
        actorUserId: toDtoUserId(user.id),
        tagId: data.tagId as unknown as Parameters<
          typeof module.deleteTag
        >[0]["input"]["tagId"],
      },
    });
    return { affectedCount: result.affectedNoteIds.length };
  });
