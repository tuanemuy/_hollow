import type { ServiceArgs } from "../types";

export type SuggestPublicTagsInput = Readonly<{
  prefix: string;
  limit?: number;
}>;

export type PublicTagSuggestionDTO = Readonly<{ name: string }>;

export type SuggestPublicTagsOutput = Readonly<{
  suggestions: readonly PublicTagSuggestionDTO[];
}>;

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

/**
 * Public-surface tag autocomplete for the P32 search filter drawer.
 *
 * Suggests tag names that (a) prefix-match the typed fragment and (b) are
 * linked to at least one publicly visible, active note. The "linked to a
 * public note" gate lives in the adapter SQL and is the enumeration guard:
 * a tag attached only to private notes never leaks. An empty / whitespace
 * prefix short-circuits to no suggestions so the dropdown stays closed
 * until the user types.
 */
export async function suggestPublicTags({
  container,
  input,
}: ServiceArgs<SuggestPublicTagsInput>): Promise<SuggestPublicTagsOutput> {
  const prefix = input.prefix.trim();
  if (prefix.length === 0) {
    return { suggestions: [] };
  }
  const limit = clampLimit(input.limit);
  const names = await container.unitOfWorkProvider.run(({ tagRepository }) =>
    tagRepository.searchPublicByNamePrefix(prefix, limit),
  );
  return { suggestions: names.map((name) => ({ name })) };
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}
