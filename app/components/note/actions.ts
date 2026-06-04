import { createServerFn } from "@tanstack/react-start";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { BusinessRuleError } from "@/core/domain/error";
import type {
  NoteId as DomainNoteId,
  NoteRevisionId as DomainNoteRevisionId,
  FrontMatterRecord,
} from "@/core/domain/note/valueObject";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { requireCurrentUser } from "@/lib/server/currentUser";
import { EDIT_LOCK_TTL_SEC } from "./constants";
import { type FlatDirectory, flattenDirectoryTree } from "./directoryTree";
import {
  acquireLockSchema,
  bulkExportSchema,
  bulkMoveSchema,
  bulkTrashSchema,
  createNoteSchema,
  deleteNoteSchema,
  duplicateNoteSchema,
  extendLockSchema,
  moveNoteSchema,
  purgeNoteSchema,
  releaseLockSchema,
  renameNoteSchema,
  restoreNoteRevisionSchema,
  restoreNoteSchema,
  saveDraftSchema,
  saveNoteSchema,
  searchInternalLinkTargetsSchema,
} from "./schema";

// All note server fns return only the minimal scalar payload the UI
// needs (typically `{ noteId }`). The full `NoteDTO` carries
// `frontMatter: Record<string, unknown>` which TanStack Start's
// transport-serialisation refuses to type-check (unknown index sigs).
// The client refetches via `router.invalidate()` rather than threading
// the full aggregate across the boundary. FrontMatter inputs travel as
// `frontMatterJson` (a JSON string) for the same reason; see ADR-008.

/**
 * Parse a `frontMatterJson` payload from the wire boundary into the
 * domain-shaped record. Returns `undefined` when no JSON was supplied
 * so the caller can leave the existing FrontMatter untouched on save.
 *
 * Two distinct error families surface to the client depending on which
 * boundary the input fails:
 *
 * - **Transport / shape failures** raised here as
 *   `BusinessRuleError("FRONT_MATTER_JSON_INVALID")`: malformed JSON
 *   (`JSON.parse` throws), or the parsed value is not a plain object
 *   (`null`, array, primitive). We translate `SyntaxError` into a
 *   structured business failure so the error-response middleware
 *   serialises it consistently rather than leaking a `SyntaxError` to
 *   the client.
 * - **Domain invariant failures** raised by `FrontMatter.create` /
 *   downstream value-object construction (e.g. forbidden value shapes,
 *   reserved keys). Those carry their own domain error codes such as
 *   `FRONT_MATTER_INVALID_VALUE` and are NOT re-translated here — they
 *   flow through the usecase unchanged so the client can distinguish
 *   "your JSON did not parse" from "your FrontMatter violates a domain
 *   rule".
 */
export function parseFrontMatterJson(
  raw: string | undefined,
): FrontMatterRecord | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new BusinessRuleError(
      "FRONT_MATTER_JSON_INVALID",
      "FrontMatter JSON is not parseable",
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new BusinessRuleError(
      "FRONT_MATTER_JSON_INVALID",
      "FrontMatter must be a JSON object",
    );
  }
  return parsed as FrontMatterRecord;
}

export const createNoteFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(createNoteSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/createNote"),
    );
    const frontMatter = parseFrontMatterJson(data.frontMatterJson) ?? {};
    const result = await module.createNote({
      container,
      input: {
        actorUserId: user.id,
        title: data.title,
        contentHtml: data.contentHtml,
        directoryId:
          data.directoryId === null ? null : (data.directoryId as DirectoryId),
        frontMatter,
        tagNames: data.tagNames,
        internalLinkRefs: [],
      },
    });
    return { noteId: result.note.id };
  });

export const saveNoteFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(saveNoteSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/saveNote"),
    );
    const frontMatter = parseFrontMatterJson(data.frontMatterJson);
    const result = await module.saveNote({
      container,
      input: {
        actorUserId: user.id,
        noteId: data.noteId as DomainNoteId,
        ...(data.title === undefined ? {} : { title: data.title }),
        ...(data.contentHtml === undefined
          ? {}
          : { contentHtml: data.contentHtml }),
        ...(data.tagNames === undefined ? {} : { tagNames: data.tagNames }),
        ...(frontMatter === undefined ? {} : { frontMatter }),
        requireLock: false,
      },
    });
    return { noteId: result.note.id };
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
        noteId: data.noteId as DomainNoteId,
        newTitle: data.newTitle,
        regenerateSlug: data.regenerateSlug,
      },
    });
    return { noteId: result.note.id };
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
        noteId: data.noteId as DomainNoteId,
        newDirectoryId: data.newDirectoryId as DirectoryId,
      },
    });
    return { noteId: result.note.id };
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
        noteId: data.noteId as DomainNoteId,
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
        noteId: data.noteId as DomainNoteId,
        restoreDirectoryId:
          data.restoreDirectoryId === null
            ? null
            : (data.restoreDirectoryId as DirectoryId),
      },
    });
    return { noteId: result.note.id };
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
        noteId: data.noteId as DomainNoteId,
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
        noteId: data.noteId as DomainNoteId,
      },
    });
    return { noteId: result.note.id };
  });

export const bulkMoveNotesFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(bulkMoveSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/bulkMoveNotes"),
    );
    const result = await module.bulkMoveNotes({
      container,
      input: {
        actorUserId: user.id,
        noteIds: data.noteIds.map((id) => id as DomainNoteId),
        newDirectoryId: data.newDirectoryId as DirectoryId,
      },
    });
    return {
      successCount: result.successCount,
      failures: result.failures.map((f) => ({
        noteId: f.noteId,
        code: f.code,
        message: f.message,
      })),
    };
  });

export const bulkTrashNotesFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(bulkTrashSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/bulkTrashNotes"),
    );
    const result = await module.bulkTrashNotes({
      container,
      input: {
        actorUserId: user.id,
        noteIds: data.noteIds.map((id) => id as DomainNoteId),
      },
    });
    return {
      successCount: result.successCount,
      failures: result.failures.map((f) => ({
        noteId: f.noteId,
        code: f.code,
        message: f.message,
      })),
    };
  });

/**
 * Bulk / view-scope export request. Delegates to `enqueueExportJob`
 * with `scope: "multiple"`; the export consumer worker runs the
 * artifact build out-of-band, and the client polls the resulting job
 * via the export-jobs route.
 */
export const bulkExportNotesFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(bulkExportSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/export/enqueueExportJob"),
    );
    const { job } = await module.enqueueExportJob({
      container,
      input: {
        actorUserId: user.id,
        format: data.format,
        scope: "multiple",
        noteIds: data.noteIds.map((id) => id as DomainNoteId),
        options: data.options,
      },
    });
    return { jobId: job.id };
  });

export const saveNoteDraftFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(saveDraftSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/saveNoteDraft"),
    );
    const frontMatter = parseFrontMatterJson(data.frontMatterJson);
    const result = await module.saveNoteDraft({
      container,
      input: {
        actorUserId: user.id,
        noteId: data.noteId as DomainNoteId,
        ...(data.title === undefined ? {} : { title: data.title }),
        ...(data.contentHtml === undefined
          ? {}
          : { contentHtml: data.contentHtml }),
        ...(frontMatter === undefined ? {} : { frontMatter }),
      },
    });
    void data.tagNames; // tag re-extraction runs in the explicit save path
    return { noteId: result.note.id };
  });

export const acquireEditLockFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(acquireLockSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/acquireEditLock"),
    );
    const result = await module.acquireEditLock({
      container,
      input: {
        actorUserId: user.id,
        noteId: data.noteId as DomainNoteId,
        ttlSec: EDIT_LOCK_TTL_SEC,
      },
    });
    return {
      noteId: result.note.id,
      expiresAt: result.note.editLock?.expiresAt ?? null,
    };
  });

export const extendEditLockFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(extendLockSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/extendEditLock"),
    );
    const result = await module.extendEditLock({
      container,
      input: {
        actorUserId: user.id,
        noteId: data.noteId as DomainNoteId,
        ttlSec: EDIT_LOCK_TTL_SEC,
      },
    });
    return {
      noteId: result.note.id,
      expiresAt: result.note.editLock?.expiresAt ?? null,
    };
  });

export const searchInternalLinkTargetsFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(searchInternalLinkTargetsSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/searchInternalLinkTargets"),
    );
    const result = await module.searchInternalLinkTargets({
      container,
      input: {
        actorUserId: user.id,
        query: data.query,
        ...(data.limit === undefined ? {} : { limit: data.limit }),
      },
    });
    return { suggestions: result.suggestions };
  });

/**
 * Issue #158: restore a past `NoteRevision` into the live note. Returns
 * the noteId so the client can navigate back to `/notes/<noteId>` once
 * the mutation succeeds.
 */
export const restoreNoteRevisionFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(restoreNoteRevisionSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/restoreNoteRevision"),
    );
    const result = await module.restoreNoteRevision({
      container,
      input: {
        actorUserId: user.id,
        noteId: data.noteId as DomainNoteId,
        revisionId: data.revisionId as DomainNoteRevisionId,
      },
    });
    return { noteId: result.note.id };
  });

export const releaseEditLockFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(releaseLockSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/note/releaseEditLock"),
    );
    await module.releaseEditLock({
      container,
      input: {
        actorUserId: user.id,
        noteId: data.noteId as DomainNoteId,
      },
    });
    return { ok: true as const };
  });

/**
 * Issue #226: client-callable wrapper around the directory-tree loader.
 *
 * Returns the same depth-prefixed `FlatDirectory[]` shape as
 * `loadDirectoryTreeFlat` so the ingestion preview modal can lazy-load
 * the tree from the client when it enters its `editing` view. The actor
 * is resolved server-side via `requireCurrentUser()` so that callers
 * cannot ask for another user's tree (ADR-008).
 */
export const getDirectoryTreeFn = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async (): Promise<{ flat: readonly FlatDirectory[] }> => {
    const user = await requireCurrentUser();
    const { container, module } = await loadServerDeps(
      () => import("@/core/application/directory/getDirectoryTree"),
    );
    const { tree } = await module.getDirectoryTree({
      container,
      input: { actorUserId: user.id },
    });
    return { flat: flattenDirectoryTree(tree) };
  });
