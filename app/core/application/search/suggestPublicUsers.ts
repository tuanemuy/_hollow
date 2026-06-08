import type { ServiceArgs } from "../types";

export type SuggestPublicUsersInput = Readonly<{
  prefix: string;
  limit?: number;
}>;

export type PublicUserSuggestionDTO = Readonly<{
  username: string;
  displayName: string;
}>;

export type SuggestPublicUsersOutput = Readonly<{
  suggestions: readonly PublicUserSuggestionDTO[];
}>;

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

/**
 * Public-surface username autocomplete for the P32 search filter drawer.
 *
 * Suggests live authors (`status NOT IN ('deleted','suspended')`) who own
 * at least one publicly visible note and whose username prefix-matches the
 * typed fragment. The "owns a public note" gate lives in the adapter SQL
 * and is the enumeration guard. An empty / whitespace prefix returns no
 * suggestions so the dropdown stays closed until the user types.
 */
export async function suggestPublicUsers({
  container,
  input,
}: ServiceArgs<SuggestPublicUsersInput>): Promise<SuggestPublicUsersOutput> {
  const prefix = input.prefix.trim();
  if (prefix.length === 0) {
    return { suggestions: [] };
  }
  const limit = clampLimit(input.limit);
  const users = await container.unitOfWorkProvider.run(({ userRepository }) =>
    userRepository.searchPublicByUsernamePrefix(prefix, limit),
  );
  return {
    suggestions: users.map((user) => ({
      username: user.username,
      displayName: user.displayName,
    })),
  };
}

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}
