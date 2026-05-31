import { UserId as AdminSettingsUserId } from "@/core/domain/adminSettings/valueObject";
import { UserId as IdentityUserId } from "@/core/domain/identity/valueObject";
import type { IngestionPromptPurpose } from "@/core/domain/ingestion/ports/promptResolver";
import type { ServiceArgs } from "../types";

export type GetEffectiveIngestionPromptsInput = {
  actorUserId: string;
};

export type EffectiveIngestionPrompt = {
  /**
   * The fully resolved prompt text the ingestion pipeline would actually
   * apply for this purpose when the user leaves the per-upload override
   * blank. Resolved via `promptResolver` (per-user override → instance
   * default → empty string). An empty string is the documented signal to
   * fall back to the LLM provider's built-in instruction (see
   * `BUILTIN_PROMPT_DEFAULTS` / Issue #218 ADR-002), which the UI surfaces
   * as copy rather than text.
   */
  text: string;
  /**
   * Whether the resolved text came from the actor's own override layer
   * (vs the instance default). Mirrors the resolver's adoption predicate
   * exactly — `entry !== undefined && entry.text.length > 0` — so the
   * displayed badge never contradicts what the resolver actually used. A
   * user override row whose entry for this purpose is empty resolves to
   * the instance default, so `isUserOverride` stays `false` there.
   */
  isUserOverride: boolean;
};

export type GetEffectiveIngestionPromptsOutput = {
  structure: EffectiveIngestionPrompt;
  metadata: EffectiveIngestionPrompt;
};

// Only the two purposes the upload dialog exposes a per-upload override
// for. `title` / `directory` have no override field in `SelectView`, so
// they are intentionally out of scope (see .issue/358/plan.md).
const PURPOSES = ["structure", "metadata"] as const satisfies ReadonlyArray<
  IngestionPromptPurpose & ("structure" | "metadata")
>;

/**
 * Read-only projection of the prompt values that ingestion would apply
 * for the actor when no per-upload override is entered, for the
 * `structure` / `metadata` purposes the upload dialog exposes.
 *
 * Returns the resolved text (via `promptResolver`, keeping the resolution
 * precedence inside the application layer) plus whether that text came
 * from the actor's own override layer. No writes, no event collection —
 * the user-override repository is read inside a unit of work purely to
 * derive `isUserOverride` with the same predicate the resolver uses.
 */
export async function getEffectiveIngestionPrompts({
  container,
  input,
}: ServiceArgs<GetEffectiveIngestionPromptsInput>): Promise<GetEffectiveIngestionPromptsOutput> {
  const identityUserId = IdentityUserId.create(input.actorUserId);
  const adminSettingsUserId = AdminSettingsUserId.create(input.actorUserId);

  const overridePrompts = await container.unitOfWorkProvider.run(
    async ({ userPromptOverrideRepository }) => {
      const existing =
        await userPromptOverrideRepository.findByOwner(adminSettingsUserId);
      return existing?.entity.prompts ?? {};
    },
  );

  const resolve = async (
    purpose: (typeof PURPOSES)[number],
  ): Promise<EffectiveIngestionPrompt> => {
    const text = await container.promptResolver.resolveFor(
      identityUserId,
      purpose,
    );
    const entry = overridePrompts[purpose];
    return {
      text,
      isUserOverride: entry !== undefined && entry.text.length > 0,
    };
  };

  const [structure, metadata] = await Promise.all([
    resolve("structure"),
    resolve("metadata"),
  ]);

  return { structure, metadata };
}
