import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import type { ServiceArgs } from "../types";

export type SitemapEntry = Readonly<{
  /** Path component (excluding origin) — e.g. `/u/alice/my-note`. */
  path: string;
  /** ISO 8601 timestamp; omitted for entries that have no meaningful update time. */
  lastmod?: string;
}>;

export type ListSitemapEntriesOutput = Readonly<{
  entries: readonly SitemapEntry[];
}>;

/**
 * Public-sitemap projection. Returns the **dynamic** URL paths that
 * sitemap.xml needs to enumerate — public notes (`/u/<username>/<slug>`)
 * and the per-owner public top (`/u/<username>`) for every owner that
 * has at least one public note. Static routes (`/`, `/signup`,
 * `/login`, `/search`, `/terms`, `/privacy`, `/about`) are not the
 * application layer's concern; the presentation layer combines them
 * with the dynamic entries returned here.
 *
 * Volume is capped at 1000 public notes (see Issue #205 ADR-002). When
 * the cap is hit, callers should plan for a `sitemap-index.xml`
 * fan-out in a follow-up.
 *
 * The owner gate matches the rest of the publication surface: notes
 * belonging to deleted or suspended owners are dropped so the public
 * sitemap cannot expose them. Notes that are no longer `status ===
 * 'active'` (trashed / purged) are likewise excluded.
 */
export async function listSitemapEntries({
  container,
}: Omit<ServiceArgs<undefined>, "input">): Promise<ListSitemapEntriesOutput> {
  return container.unitOfWorkProvider.run(
    async ({ publicationStateRepository, noteRepository, userRepository }) => {
      const publicRefs = await publicationStateRepository.findAllPublic({
        limit: 1000,
      });
      if (publicRefs.length === 0) return { entries: [] };

      const noteIds: readonly NoteId[] = publicRefs.map((r) => r.noteId);
      const ownerIds: readonly UserId[] = [
        ...new Set(publicRefs.map((r) => r.ownerId)),
      ];

      const [notes, owners] = await Promise.all([
        noteRepository.findByIds(noteIds),
        userRepository.findByIds(ownerIds),
      ]);

      const noteById = new Map(notes.map((n) => [n.id, n] as const));
      const ownerById = new Map(owners.map((u) => [u.id, u] as const));

      const entries: SitemapEntry[] = [];
      const seenOwnerTops = new Set<string>();

      for (const { noteId, ownerId } of publicRefs) {
        const note = noteById.get(noteId);
        if (note === undefined) continue;
        if (note.status !== "active") continue;

        const owner = ownerById.get(ownerId);
        if (owner === undefined) continue;
        if (owner.status === "deleted" || owner.status === "suspended") {
          continue;
        }

        if (!seenOwnerTops.has(owner.username)) {
          seenOwnerTops.add(owner.username);
          entries.push({ path: `/u/${owner.username}` });
        }
        entries.push({
          path: `/u/${owner.username}/${note.slug as string}`,
          lastmod: note.updatedAt.toISOString(),
        });
      }

      return { entries };
    },
  );
}
