/**
 * URL-scheme guard shared by the WYSIWYG editor's TipTap Link extension
 * (`isAllowedUri`) and the `LinkDialog` input validation (Issue #825). Mirrors
 * the server-side `SAFE_URL_SCHEMES` so the editor never displays — nor lets a
 * user insert — a URL the sanitiser would later strip. Relative / fragment /
 * query-only URLs are always allowed; absolute URLs must carry an http / https
 * / mailto scheme.
 */
const ALLOWED_LINK_SCHEMES = new Set(["http", "https", "mailto"]);

export function isAllowedLinkUri(url: string): boolean {
  if (url.startsWith("/") || url.startsWith("#") || url.startsWith("?")) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return ALLOWED_LINK_SCHEMES.has(parsed.protocol.replace(/:$/, ""));
  } catch {
    return false;
  }
}
