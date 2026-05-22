import type { Directory } from "@/core/domain/directory/entity";
import type { DirectoryRepository } from "@/core/domain/directory/ports/directoryRepository";
import { DirectoryService } from "@/core/domain/directory/service";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { Note } from "@/core/domain/note/entity";
import type { HtmlSanitizer } from "@/core/domain/note/ports/htmlSanitizer";
import type { PublicationStateRepository } from "@/core/domain/publication/ports/publicationStateRepository";
import type { NoteSnapshot } from "@/core/domain/search/entity";
import type { Visibility } from "@/core/domain/search/valueObject";
import type { TagRepository } from "@/core/domain/tag/ports/tagRepository";
import type { TagId } from "@/core/domain/tag/valueObject";

/**
 * Cross-aggregate dependencies the snapshot builder reads from. Each
 * port is fetched in batch (`findByIds` / `findByNoteIds`) so building
 * snapshots for a page of notes is bounded by the page size rather than
 * fanning out into N+1 lookups.
 *
 * Directory paths are resolved through {@link DirectoryService.computePath}
 * because {@link DirectoryRepository} has no `findByIds` member; results
 * are cached per `DirectoryId` inside the helper so repeated lookups
 * within one page (notes that share a directory) collapse to a single
 * `findAncestors` round-trip.
 */
export type BuildNoteSnapshotDeps = Readonly<{
  directoryRepository: DirectoryRepository;
  tagRepository: TagRepository;
  publicationStateRepository: PublicationStateRepository;
  htmlSanitizer: HtmlSanitizer;
}>;

/**
 * Re-projection of `Note` aggregates into `NoteSnapshot`s consumed by
 * `SearchDocument.fromSnapshot`. The helper is the canonical seam for
 * any production code path that needs to feed snapshots to the search
 * index outside the Note write path (currently
 * `AdminSettings.RebuildSearchIndex`).
 *
 * Contract:
 * - Empty `notes` short-circuits to `[]` without touching any
 *   repository.
 * - `tagNames` follows the order returned by `tagRepository.findByIds`
 *   (unspecified by the port contract); callers that need a stable
 *   sort must apply one downstream.
 * - `visibility` falls back to `'private'` when no `publication_states`
 *   row exists, mirroring the domain default the FTS index already
 *   relies on.
 * - `frontMatterDate` is resolved through {@link parseFrontMatterDate}
 *   so invalid values cleanly degrade to `null` rather than throwing.
 */
export async function buildNoteSnapshots(
  notes: readonly Note[],
  deps: BuildNoteSnapshotDeps,
): Promise<NoteSnapshot[]> {
  if (notes.length === 0) return [];

  const tagIdSet = new Set<TagId>();
  const directoryIdSet = new Set<DirectoryId>();
  for (const note of notes) {
    for (const tagId of note.tagIds) tagIdSet.add(tagId);
    directoryIdSet.add(note.directoryId);
  }

  const [tags, publicationStates] = await Promise.all([
    tagIdSet.size === 0
      ? Promise.resolve<readonly { id: TagId; name: string }[]>([])
      : deps.tagRepository.findByIds(Array.from(tagIdSet)),
    deps.publicationStateRepository.findByNoteIds(notes.map((n) => n.id)),
  ]);
  const tagNameById = new Map<TagId, string>();
  for (const tag of tags) tagNameById.set(tag.id, tag.name);

  const visibilityByNoteId = new Map<string, Visibility>();
  for (const state of publicationStates) {
    visibilityByNoteId.set(state.noteId, state.visibility);
  }

  const directoryPathByDirectoryId = new Map<DirectoryId, string>();
  for (const directoryId of directoryIdSet) {
    const found = await deps.directoryRepository.findById(directoryId);
    if (found === null) {
      directoryPathByDirectoryId.set(directoryId, "/");
      continue;
    }
    const path = await DirectoryService.computePath(
      found.entity satisfies Directory,
      deps.directoryRepository,
    );
    directoryPathByDirectoryId.set(directoryId, path as string);
  }

  const out: NoteSnapshot[] = [];
  for (const note of notes) {
    const plainBody = deps.htmlSanitizer.toPlainText(note.contentHtml);
    const tagNames: string[] = [];
    for (const tagId of note.tagIds) {
      const name = tagNameById.get(tagId);
      if (name !== undefined) tagNames.push(name);
    }
    out.push({
      noteId: note.id,
      ownerId: note.ownerId,
      visibility: visibilityByNoteId.get(note.id) ?? "private",
      title: note.title,
      plainBody,
      tagNames,
      directoryPath: directoryPathByDirectoryId.get(note.directoryId) ?? "/",
      frontMatterDate: parseFrontMatterDate(
        (note.frontMatter as Readonly<Record<string, unknown>>).date,
      ),
      updatedAt: note.updatedAt,
    });
  }
  return out;
}

/**
 * Best-effort coercion of the optional `frontMatter['date']` field into
 * a `Date`. Returns `null` when the input is missing, malformed (e.g.
 * not a `Date` instance and not a parseable date string), or yields
 * `NaN` after parsing. The Search domain's `SearchDocument.fromSnapshot`
 * accepts `null` and falls back to `updatedAt` for `dateForCalendar`.
 *
 * Accepts:
 * - `Date` instances (returned verbatim when finite)
 * - Strings parseable by the `Date` constructor (ISO 8601, RFC 2822, …)
 * - Numbers interpreted as epoch milliseconds (when finite)
 *
 * Anything else — `null`, `undefined`, booleans, arrays, objects,
 * `NaN`-yielding strings — is normalised to `null`.
 */
export function parseFrontMatterDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
  }
  return null;
}
