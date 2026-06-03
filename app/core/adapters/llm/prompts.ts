import type {
  LLMMetadataInput,
  LLMStructureInput,
} from "@/core/domain/ingestion/ports/llmProvider";

/**
 * Shared prompt builders for the JSON-envelope LLM adapters (Anthropic /
 * OpenAI / Gemini). The three providers speak the same structuring /
 * metadata contract, so the prompt text lives here once — keeping the
 * suggestion-quality guidance identical regardless of which provider an
 * admin selects, and preventing the three copies from drifting.
 *
 * Concern separation (Issue #396): the role declaration and the JSON output
 * contract are *system-owned* and always emitted here verbatim. The
 * operator-supplied `input.prompt` is the operator's optional *additional
 * analysis intent* — it is *appended* (never substituted) between the role
 * declaration and the guidance, and only when non-empty after trimming.
 * This keeps the output contract structurally unbreakable by operator input.
 *
 * Asymmetric intent placement (Issue #430 ADR-004): the structure-body intent
 * (`input.prompt`) stays in front of the JSON output contract, but the
 * title/directory intents (`input.titlePrompt` / `input.directoryPrompt`) are
 * placed immediately after their respective guidance lines, which sit *after*
 * the output contract. This contextualises each intent next to the concern it
 * supplements; the output contract remains the fixed, system-owned tail.
 */

// Fixed label prefixing the operator's appended intent (Issue #396 ADR-001).
// Always present when intent is appended so the model can distinguish the
// operator's additional guidance from the system-fixed role declaration.
const OPERATOR_INTENT_LABEL = "Additional analysis guidance from the operator:";

function hasExistingDirectories(input: LLMStructureInput): boolean {
  return (
    input.existingDirectories !== undefined &&
    input.existingDirectories.length > 0
  );
}

function operatorIntentSection(prompt: string): readonly string[] {
  const trimmed = prompt.trim();
  return trimmed.length > 0 ? [OPERATOR_INTENT_LABEL, trimmed] : [];
}

export function buildStructureSystemPrompt(input: LLMStructureInput): string {
  const directoryGuidance = hasExistingDirectories(input)
    ? 'For "directorySuggestion": prefer placing the note under one of the existing directories listed in the user message — when one fits, return that path verbatim (exactly as listed). Only when none of them fits, propose a new directory path. You may propose a nested path using "/" as the separator (e.g. "親/子"), up to 10 levels deep.'
    : 'For "directorySuggestion": propose a fitting new directory path, or null when no clear placement applies. You may propose a nested path using "/" as the separator (e.g. "親/子"), up to 10 levels deep.';
  return [
    "You convert raw note material into a sanitised HTML draft.",
    ...operatorIntentSection(input.prompt),
    `Respond with a single JSON object on one line with the keys "html" (string), "titleSuggestion" (string), and "directorySuggestion" (string or null).`,
    'For "titleSuggestion": do not reuse the file name. Derive a concise, meaningful title from the note content itself.',
    ...operatorIntentSection(input.titlePrompt),
    directoryGuidance,
    ...operatorIntentSection(input.directoryPrompt),
    `Locale for natural-language output (including the title): ${input.locale}.`,
    "Do not include code fences. Do not include any text before or after the JSON object.",
  ].join("\n");
}

export function buildStructureUserMessage(input: LLMStructureInput): string {
  const sections = [`Source text:\n${input.rawText}`];
  if (hasExistingDirectories(input)) {
    const list = (input.existingDirectories as readonly string[])
      .map((path) => `- ${path}`)
      .join("\n");
    sections.push(`Existing directories:\n${list}`);
  }
  return sections.join("\n\n");
}

export function buildMetadataSystemPrompt(input: LLMMetadataInput): string {
  return [
    "You extract tag names and aliases from an HTML note body.",
    ...operatorIntentSection(input.prompt),
    `Respond with a single JSON object on one line with the keys "tags" (string[]) and "aliases" (string[]).`,
    'For "tags": do not mechanically extract words from the text. Consider the overall content and propose a meaningful set of about 3 to 5 tags at a consistent level of abstraction (avoid mixing overly specific and broad tags).',
    "Do not include code fences. Do not include any text before or after the JSON object.",
  ].join("\n");
}

export function buildMetadataUserMessage(input: LLMMetadataInput): string {
  return `HTML body:\n${input.html}`;
}
