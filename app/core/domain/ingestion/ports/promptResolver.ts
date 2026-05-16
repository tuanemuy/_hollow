import type { UserId } from "@/core/domain/identity/valueObject";

/**
 * Logical kinds of prompts the ingestion pipeline asks the LLM for.
 *
 * Mirrors the `PromptPurpose` enum in the adminSettings domain — kept
 * as a local literal union so the ingestion port does not depend on
 * the adminSettings module's full value object. The adapter
 * implementation is responsible for translating between the two.
 */
export type IngestionPromptPurpose =
  | "structure"
  | "title"
  | "directory"
  | "metadata";

/**
 * Resolves the prompt template text for a given `(user, purpose)`. The
 * implementation walks the precedence: per-user override →
 * instance-default template.
 *
 * Returned strings are the fully interpolated prompt body that the LLM
 * adapter sends as the system / user message. Variable substitution is
 * the resolver's responsibility; callers receive plain text.
 */
export interface PromptResolver {
  resolveFor(userId: UserId, purpose: IngestionPromptPurpose): Promise<string>;
}
