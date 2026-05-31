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
 */

function hasExistingDirectories(input: LLMStructureInput): boolean {
  return (
    input.existingDirectories !== undefined &&
    input.existingDirectories.length > 0
  );
}

export function buildStructureSystemPrompt(input: LLMStructureInput): string {
  const base =
    input.prompt.trim().length > 0
      ? input.prompt
      : "You convert raw note material into a sanitised HTML draft.";
  const directoryGuidance = hasExistingDirectories(input)
    ? 'For "directorySuggestion": prefer placing the note under one of the existing directories listed in the user message — when one fits, return that path verbatim (exactly as listed). Only when none of them fits, propose a new directory as a single top-level name (one segment, no slashes).'
    : 'For "directorySuggestion": propose a fitting directory as a single top-level name (one segment, no slashes), or null when no clear placement applies.';
  return [
    base,
    `Respond with a single JSON object on one line with the keys "html" (string), "titleSuggestion" (string), and "directorySuggestion" (string or null).`,
    'For "titleSuggestion": do not reuse the file name. Derive a concise, meaningful title from the note content itself.',
    directoryGuidance,
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
  const base =
    input.prompt.trim().length > 0
      ? input.prompt
      : "You extract tag names and aliases from an HTML note body.";
  return [
    base,
    `Respond with a single JSON object on one line with the keys "tags" (string[]) and "aliases" (string[]).`,
    'For "tags": do not mechanically extract words from the text. Consider the overall content and propose a meaningful set of about 3 to 5 tags at a consistent level of abstraction (avoid mixing overly specific and broad tags).',
    "Do not include code fences. Do not include any text before or after the JSON object.",
  ].join("\n");
}

export function buildMetadataUserMessage(input: LLMMetadataInput): string {
  return `HTML body:\n${input.html}`;
}
