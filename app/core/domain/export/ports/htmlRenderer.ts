import type { FrontMatter } from "@/core/domain/note/valueObject";

/**
 * Wraps the canonical content HTML in an export-ready document
 * (standalone HTML file, with FrontMatter prepended when requested
 * and design tokens applied so the artifact renders without the live
 * site's CSS pipeline).
 *
 * Failure cases share the `RenderError` class declared by
 * `MarkdownRenderer` — keep them in sync if the contract diverges.
 */
export interface HtmlRenderer {
  wrapForExport(
    html: string,
    options: Readonly<{
      includeFrontMatter: boolean;
      frontMatter: FrontMatter;
      designTokens: Readonly<Record<string, string>>;
    }>,
  ): Promise<string>;
}
