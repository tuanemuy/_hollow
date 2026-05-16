/**
 * Office-document extraction port. Targets `.docx` / `.odt` / `.xlsx`
 * / `.pptx` / legacy variants. Returns the plain-text body plus loose
 * structural hints (heading markers, list markers, table cell breaks)
 * the LLM can use to reconstruct the original layout in HTML.
 */

export class OfficeParseError extends Error {
  override readonly name = "OfficeParseError";

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isOfficeParseError(error: unknown): error is OfficeParseError {
  return error instanceof OfficeParseError;
}

export type OfficeExtractInput = Readonly<{
  bytes: ArrayBuffer;
  mime: string;
}>;

export type OfficeExtractResult = Readonly<{
  text: string;
  structureHints: readonly string[];
}>;

export interface OfficeExtractor {
  extractText(input: OfficeExtractInput): Promise<OfficeExtractResult>;
}
