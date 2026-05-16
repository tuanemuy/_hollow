import { createServerFn } from "@tanstack/react-start";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { ShareLinkId } from "@/core/domain/publication/valueObject";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import {
  changeVisibilitySchema,
  issueShareLinkSchema,
  revokeShareLinkSchema,
  setShareLinkPasswordSchema,
} from "../schema";

export const changeVisibilityFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(changeVisibilitySchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () =>
        import("@/core/application/publication/changePublicationVisibility"),
    );
    return module.changePublicationVisibility({
      container,
      input: {
        actorUserId: actor.id,
        noteId: data.noteId as NoteId,
        nextVisibility: data.nextVisibility,
      },
    });
  });

export const issueShareLinkFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(issueShareLinkSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/publication/issueShareLink"),
    );
    return module.issueShareLink({
      container,
      input: {
        actorUserId: actor.id,
        noteId: data.noteId as NoteId,
        password: data.password,
      },
    });
  });

export const revokeShareLinkFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(revokeShareLinkSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/publication/revokeShareLink"),
    );
    await module.revokeShareLink({
      container,
      input: {
        actorUserId: actor.id,
        shareLinkId: data.shareLinkId as ShareLinkId,
      },
    });
    return { ok: true };
  });

export const setShareLinkPasswordFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(setShareLinkPasswordSchema))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const actor = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/publication/setShareLinkPassword"),
    );
    await module.setShareLinkPassword({
      container,
      input: {
        actorUserId: actor.id,
        shareLinkId: data.shareLinkId as ShareLinkId,
        newPassword: data.newPassword,
      },
    });
    return { ok: true };
  });
