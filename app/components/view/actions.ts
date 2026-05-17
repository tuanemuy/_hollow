import { createServerFn } from "@tanstack/react-start";
import { resolveTagNamesToIds } from "@/components/tag/loaders";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { loadServerDeps } from "@/core/presentation/serverAction";
import { validateInput } from "@/core/presentation/validator";
import { requireCurrentUser } from "@/lib/server/currentUser";
import { createSavedViewSchema } from "./schema";

/**
 * Save the caller's current home-page filter + display mode as a
 * `SavedView`.
 *
 * Tags arrive by **name** (matching the URL representation) and are
 * resolved to ids server-side via `listTags` before the
 * `createSavedView` usecase runs. Names that do not correspond to an
 * existing tag are silently dropped — the SavedView entity treats
 * unresolved tag references as broken conditions, not validation errors.
 */
export const createSavedViewFn = createServerFn({ method: "POST" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(createSavedViewSchema))
  .handler(async ({ data }) => {
    const user = await requireCurrentUser();

    const tagIds = await resolveTagNamesToIds(user.id, data.query.tagNames);

    const { container, module } = await loadServerDeps(
      () => import("@/core/application/view/createSavedView"),
    );
    const result = await module.createSavedView({
      container,
      input: {
        actorUserId: user.id,
        name: data.name,
        kind: data.kind,
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
        },
        displayMode: data.displayMode,
        calendarDateKey: data.calendarDateKey,
        sort: data.sort,
        isDefault: data.isDefault,
      },
    });
    return { viewId: result.view.id as unknown as string };
  });
