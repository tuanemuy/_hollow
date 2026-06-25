import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { requireCurrentUser } from "@/lib/server/currentUser";
import {
  createTagSchema,
  deleteTagSchema,
  getTagMergeJobSchema,
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
      () => import("@/core/application/tag/enqueueTagMergeJob"),
    );
    const { job } = await module.enqueueTagMergeJob({
      container,
      input: {
        actorUserId: user.id,
        sourceTagId: data.sourceTagId,
        targetTagId: data.targetTagId,
      },
    });
    return { jobId: job.id };
  });

// Progress poller for the `MergeTagDialog` determinate bar. The client
// polls a `jobId` it received from `mergeTagsFn`; ownership is enforced
// in the usecase via `assertOwnedBy` so a guessed id cannot read another
// owner's job (IDOR, AC-8).
export const getTagMergeJobFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(getTagMergeJobSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/tag/getTagMergeJob"),
    );
    const { job } = await module.getTagMergeJob({
      container,
      input: {
        actorUserId: user.id,
        jobId: data.jobId,
      },
    });
    return { job };
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
