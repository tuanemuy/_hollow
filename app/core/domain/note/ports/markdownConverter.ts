/**
 * Port for Markdown → HTML conversion. The output is a raw HTML string
 * that still has to be passed through `HtmlSanitizer` before it can be
 * lifted into a `ContentHtml` value.
 *
 * Conversion failures surface as `ConversionError` and are mapped to
 * `SystemError` at the adapter boundary.
 */
export interface MarkdownConverter {
  toHtml(markdown: string): Promise<string>;
}
