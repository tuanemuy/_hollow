import type { ContentHtml } from "../valueObject";

/**
 * Sanitisation policy hints. The adapter owns the concrete allowlist;
 * the policy here is a high-level intent toggle so the domain can ask
 * for the right tradeoff without leaking adapter internals.
 */
export type SanitizePolicy = Readonly<{
  /**
   * Allow embedded media (`<img>` / `<video>` / `<source>` etc). Most
   * note bodies want this on. Avatar / bio fields opt out.
   */
  allowMedia: boolean;
  /**
   * Allow internal-link placeholder syntax (`[[...]]`) to survive
   * sanitisation untouched. The link extraction step depends on this
   * being preserved.
   */
  allowInternalLinks: boolean;
}>;

/** Record of a node that was stripped by the sanitiser. */
export type SanitizeRemoval = Readonly<{
  tag: string;
  reason: string;
}>;

export type SanitizeResult = Readonly<{
  html: ContentHtml;
  removed: readonly SanitizeRemoval[];
}>;

/**
 * Port for HTML sanitisation. Implementations parse the raw input,
 * strip disallowed nodes / attributes, and emit a brand-typed
 * `ContentHtml` value. Failures surface as `SanitizerError` and are
 * translated by the adapter into `SystemError` at the application
 * boundary.
 */
export interface HtmlSanitizer {
  sanitize(rawHtml: string, policy: SanitizePolicy): SanitizeResult;
}
