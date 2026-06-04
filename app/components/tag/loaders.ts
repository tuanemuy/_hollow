import { cache } from "react";
import { loadServerDeps, serverData } from "@/core/presentation/serverAction";

/**
 * Per-actor cap used when materialising the full tag dictionary to
 * resolve URL-level tag **names** into domain `TagId`s. The home /
 * SavedView surfaces are designed around a user-scoped tag count that
 * fits comfortably below this bound; values above it would silently
 * drop names that happen to fall outside the page.
 */
export const TAG_RESOLVE_LIMIT = 200;

export const loadTagsForOwner = cache(
  serverData(
    () => import("@/core/application/tag/listTags"),
    ({ container }, { listTags }, actorUserId: string) =>
      listTags({
        container,
        input: {
          actorUserId,
          limit: TAG_RESOLVE_LIMIT,
        },
      }),
  ),
);

/**
 * Resolve a list of tag **names** (matching the URL representation) to
 * their domain `TagId`s for the caller. Names that do not match an
 * existing tag for the actor are silently dropped — both the
 * filter-only note listing and the `SavedView` query shape treat
 * unresolved tag references as broken conditions, not validation
 * errors.
 *
 * Returns the resolved ids as opaque strings; callers that need the
 * branded `TagId` should cast at the call site to keep this helper free
 * of cross-domain type imports.
 */
export async function resolveTagNamesToIds(
  actorUserId: string,
  names: readonly string[],
): Promise<readonly string[]> {
  if (names.length === 0) return [];
  const { container, module } = await loadServerDeps(
    () => import("@/core/application/tag/listTags"),
  );
  const { tags } = await module.listTags({
    container,
    input: {
      actorUserId,
      limit: TAG_RESOLVE_LIMIT,
    },
  });
  const byName = new Map<string, string>();
  for (const tag of tags) {
    byName.set(tag.name, tag.id);
  }
  return names
    .map((name) => byName.get(name))
    .filter((id): id is string => id !== undefined);
}
