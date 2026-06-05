import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { requireCurrentUser } from "@/lib/server/currentUser";
import {
  bulkVisibilitySchema,
  changeVisibilitySchema,
  issueShareLinkSchema,
  revokeShareLinkSchema,
  setShareLinkPasswordSchema,
} from "../schema";

export const changeVisibilityFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(changeVisibilitySchema))
  .handler(async ({ data }) => {
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () =>
        import("@/core/application/publication/changePublicationVisibility"),
    );
    return module.changePublicationVisibility({
      container,
      input: {
        actorUserId: actor.id,
        noteId: data.noteId,
        nextVisibility: data.nextVisibility,
      },
    });
  });

export const issueShareLinkFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(issueShareLinkSchema))
  .handler(async ({ data }) => {
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/publication/issueShareLink"),
    );
    return module.issueShareLink({
      container,
      input: {
        actorUserId: actor.id,
        noteId: data.noteId,
        password: data.password,
      },
    });
  });

export const revokeShareLinkFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(revokeShareLinkSchema))
  .handler(async ({ data }) => {
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/publication/revokeShareLink"),
    );
    await module.revokeShareLink({
      container,
      input: {
        actorUserId: actor.id,
        shareLinkId: data.shareLinkId,
      },
    });
    return { ok: true };
  });

/**
 * Apply a visibility change to a batch of notes. The underlying usecase
 * processes per-note sequentially so a single OCC / authorisation
 * failure does not abort the batch; per-note errors are surfaced in
 * `failures`. UI is expected to surface progress as "N/M 件処理中".
 */
export const bulkChangeVisibilityFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(bulkVisibilitySchema))
  .handler(async ({ data }) => {
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () =>
        import(
          "@/core/application/publication/bulkChangePublicationVisibility"
        ),
    );
    const result = await module.bulkChangePublicationVisibility({
      container,
      input: {
        actorUserId: actor.id,
        noteIds: data.noteIds,
        nextVisibility: data.nextVisibility,
      },
    });
    return {
      successCount: result.successCount,
      failures: result.failures.map((f) => ({
        noteId: f.noteId,
        reason: f.reason,
      })),
    };
  });

export const setShareLinkPasswordFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(setShareLinkPasswordSchema))
  .handler(async ({ data }) => {
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/publication/setShareLinkPassword"),
    );
    await module.setShareLinkPassword({
      container,
      input: {
        actorUserId: actor.id,
        shareLinkId: data.shareLinkId,
        newPassword: data.newPassword,
      },
    });
    return { ok: true };
  });
