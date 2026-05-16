import type { FrontMatter } from "@/core/domain/note/valueObject";

/**
 * Generic rendering failure raised by Markdown / HTML renderers.
 * Distinct class so callers can `instanceof`-check without enumerating
 * every adapter-specific error type.
 */
export class RenderError extends Error {
  override readonly name = "RenderError";

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export function isRenderError(error: unknown): error is RenderError {
  return error instanceof RenderError;
}

/**
 * Converts the canonical content HTML into Markdown for export. The
 * adapter is responsible for transforming inline media, hashtag
 * tokens, and internal links so the output round-trips back through
 * the ingestion pipeline.
 */
export interface MarkdownRenderer {
  fromHtml(
    html: string,
    options: Readonly<{
      includeFrontMatter: boolean;
      frontMatter: FrontMatter;
    }>,
  ): Promise<string>;
}
