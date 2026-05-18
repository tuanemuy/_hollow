import type { UserId } from "@/core/domain/identity/valueObject";
import type { ServiceArgs } from "../types";

/**
 * Discriminated-union read model for the WYSIWYG internal-link suggest
 * popup. Notes and tags are unioned and capped server-side so the UI
 * can render the list without further filtering.
 */
export type InternalLinkSuggestion =
  | Readonly<{
      kind: "note";
      noteId: string;
      title: string;
      slug: string;
    }>
  | Readonly<{
      kind: "tag";
      tagId: string;
      name: string;
    }>;

export type SearchInternalLinkTargetsInput = Readonly<{
  actorUserId: UserId;
  query: string;
  limit?: number;
}>;

export type SearchInternalLinkTargetsOutput = Readonly<{
  suggestions: readonly InternalLinkSuggestion[];
}>;

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(value, MAX_LIMIT);
}

/**
 * Owner-scoped cross-domain prefix search used by the WYSIWYG
 * internal-link suggest popup (`[[` trigger). Returns up to `limit`
 * suggestions in deterministic order: notes (by title asc, id asc)
 * first, tags (by name asc, id asc) appended after. The total is
 * truncated to `limit` after merging.
 *
 * Visibility is enforced at the port boundary by passing
 * `input.actorUserId` as the `ownerId` on both repository calls — there
 * is no separate ACL pass.
 *
 * Notes whose title contains `[`, `]`, or `|` are excluded because
 * `INTERNAL_LINK_PATTERN` on the server uses those as boundary
 * characters, so a `[[foo|bar]]` insertion for a note literally titled
 * `foo|bar` would fail to resolve (see ADR-008 in `.issue/36/adr.md`).
 */
export async function searchInternalLinkTargets({
  container,
  input,
}: ServiceArgs<SearchInternalLinkTargetsInput>): Promise<SearchInternalLinkTargetsOutput> {
  const limit = clampLimit(input.limit);
  const trimmed = input.query.trim();
  if (trimmed.length === 0) return { suggestions: [] };

  const { notes, tags } = await container.unitOfWorkProvider.run(
    async (ctx) => {
      const [notesResult, tagsResult] = await Promise.all([
        ctx.noteRepository.searchByTitlePrefix(
          input.actorUserId,
          trimmed,
          limit,
        ),
        ctx.tagRepository.searchByNamePrefix(input.actorUserId, trimmed, limit),
      ]);
      return { notes: notesResult, tags: tagsResult };
    },
  );

  const suggestions: InternalLinkSuggestion[] = [];
  for (const note of notes) {
    if (suggestions.length >= limit) break;
    // NoteTitle permits `[` / `]` / `|`, but INTERNAL_LINK_PATTERN
    // treats them as boundary characters, so a `[[title]]` insertion
    // would not round-trip. Filter such notes out at the source
    // (ADR-008) rather than emitting broken links.
    if (/[[\]|]/.test(note.title)) continue;
    suggestions.push({
      kind: "note",
      noteId: note.id,
      title: note.title,
      slug: note.slug,
    });
  }
  for (const tag of tags) {
    if (suggestions.length >= limit) break;
    suggestions.push({
      kind: "tag",
      tagId: tag.id,
      name: tag.name,
    });
  }
  return { suggestions };
}
