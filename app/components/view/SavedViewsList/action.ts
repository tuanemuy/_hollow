import { createServerFn } from "@tanstack/react-start";
import { resolveTagNamesToIds } from "@/components/tag/loaders";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import {
  deleteSavedViewSchema,
  duplicateSavedViewSchema,
  renameSavedViewSchema,
  repairSavedViewSchema,
  setDefaultSavedViewSchema,
  updateSavedViewSchema,
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

/**
 * Edit an existing SavedView's filter conditions and display settings
 * (Issue #405). Like `createSavedViewFn`, tags arrive by **name** and are
 * resolved to ids via `listTags` before the `updateSavedView` usecase
 * runs. Unresolved names are dropped — the entity treats them as broken
 * conditions, not validation errors.
 */
export const updateSavedViewFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(updateSavedViewSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();

    const tagIds = await resolveTagNamesToIds(actor.id, data.query.tagNames);

    const { container, module } = await loadServerDeps(
      () => import("@/core/application/view/updateSavedView"),
    );
    await module.updateSavedView({
      container,
      input: {
        actorUserId: actor.id,
        viewId: data.viewId,
        name: data.name,
        query: {
          directoryId: data.query.directoryId,
          tagIds,
          dateRange:
            data.query.dateRange === null
              ? null
              : {
                  from: data.query.dateRange.from,
                  to: data.query.dateRange.to,
                },
          keyword: data.query.keyword,
          referencingNoteId: data.query.referencingNoteId,
          visibilityFilter: data.query.visibilityFilter,
        },
        displayMode: data.displayMode,
        calendarDateKey: data.calendarDateKey,
        sort: data.sort,
        isDefault: data.isDefault,
      },
    });
    return { ok: true };
  });

export const duplicateSavedViewFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(duplicateSavedViewSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/view/duplicateSavedView"),
    );
    await module.duplicateSavedView({
      container,
      input: { actorUserId: actor.id, viewId: data.viewId },
    });
    return { ok: true };
  });

export const repairSavedViewFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(repairSavedViewSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/view/repairSavedView"),
    );
    await module.repairSavedView({
      container,
      input: { actorUserId: actor.id, viewId: data.viewId },
    });
    return { ok: true };
  });
