import { createServerFn } from "@tanstack/react-start";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { requireCurrentUser } from "@/lib/server/currentUser";
import {
  createNoteSchema,
  deleteNoteSchema,
  duplicateNoteSchema,
  moveNoteSchema,
  purgeNoteSchema,
  renameNoteSchema,
  restoreNoteSchema,
  saveNoteSchema,
} from "./schema";

// All note server fns return only the minimal scalar payload the UI
// needs (typically `{ noteId }`). The full `NoteDTO` carries
// `frontMatter: Record<string, unknown>` which TanStack Start's
// transport-serialisation refuses to type-check (unknown index sigs).
// The client refetches via `router.invalidate()` rather than threading
// the full aggregate across the boundary.

export const createNoteFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(createNoteSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/createNote"),
    );
    const result = await module.createNote({
      container,
      input: {
        actorUserId: user.id,
        title: data.title,
        contentHtml: data.contentHtml,
        directoryId:
          data.directoryId === null
            ? null
            : (data.directoryId as unknown as Parameters<
                typeof module.createNote
              >[0]["input"]["directoryId"]),
        frontMatter: {},
        tagNames: data.tagNames,
        internalLinkRefs: [],
      },
    });
    return { noteId: result.note.id as unknown as string };
  });

export const saveNoteFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(saveNoteSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/saveNote"),
    );
    const result = await module.saveNote({
      container,
      input: {
        actorUserId: user.id,
        noteId: data.noteId as unknown as Parameters<
          typeof module.saveNote
        >[0]["input"]["noteId"],
        ...(data.title === undefined ? {} : { title: data.title }),
        ...(data.contentHtml === undefined
          ? {}
          : { contentHtml: data.contentHtml }),
        ...(data.tagNames === undefined ? {} : { tagNames: data.tagNames }),
        requireLock: false,
      },
    });
    return { noteId: result.note.id as unknown as string };
  });

export const renameNoteFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(renameNoteSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/renameNote"),
    );
    const result = await module.renameNote({
      container,
      input: {
        actorUserId: user.id,
        noteId: data.noteId as unknown as Parameters<
          typeof module.renameNote
        >[0]["input"]["noteId"],
        newTitle: data.newTitle,
        regenerateSlug: data.regenerateSlug,
      },
    });
    return { noteId: result.note.id as unknown as string };
  });

export const moveNoteFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(moveNoteSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/moveNote"),
    );
    const result = await module.moveNote({
      container,
      input: {
        actorUserId: user.id,
        noteId: data.noteId as unknown as Parameters<
          typeof module.moveNote
        >[0]["input"]["noteId"],
        newDirectoryId: data.newDirectoryId as unknown as Parameters<
          typeof module.moveNote
        >[0]["input"]["newDirectoryId"],
      },
    });
    return { noteId: result.note.id as unknown as string };
  });

export const deleteNoteFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(deleteNoteSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/deleteNote"),
    );
    await module.deleteNote({
      container,
      input: {
        actorUserId: user.id,
        noteId: data.noteId as unknown as Parameters<
          typeof module.deleteNote
        >[0]["input"]["noteId"],
      },
    });
    return { ok: true as const };
  });

export const restoreNoteFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(restoreNoteSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/restoreNote"),
    );
    const result = await module.restoreNote({
      container,
      input: {
        actorUserId: user.id,
        noteId: data.noteId as unknown as Parameters<
          typeof module.restoreNote
        >[0]["input"]["noteId"],
        restoreDirectoryId:
          data.restoreDirectoryId === null
            ? null
            : (data.restoreDirectoryId as unknown as NonNullable<
                Parameters<
                  typeof module.restoreNote
                >[0]["input"]["restoreDirectoryId"]
              >),
      },
    });
    return { noteId: result.note.id as unknown as string };
  });

export const purgeNoteFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(purgeNoteSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/purgeNote"),
    );
    await module.purgeNote({
      container,
      input: {
        actorUserId: user.id,
        noteId: data.noteId as unknown as Parameters<
          typeof module.purgeNote
        >[0]["input"]["noteId"],
      },
    });
    return { ok: true as const };
  });

export const duplicateNoteFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(duplicateNoteSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/duplicateNote"),
    );
    const result = await module.duplicateNote({
      container,
      input: {
        actorUserId: user.id,
        noteId: data.noteId as unknown as Parameters<
          typeof module.duplicateNote
        >[0]["input"]["noteId"],
      },
    });
    return { noteId: result.note.id as unknown as string };
  });
