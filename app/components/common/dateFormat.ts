/**
 * Format an ISO 8601 instant in the app's fixed display zone (JST) with a
 * ja-JP locale. Pinning locale + timeZone makes SSR (Workers defaults Intl
 * to UTC) and the client render byte-identical, closing the hydration
 * mismatch class at a single point (#821 / #817 ADR-001). Formatting is the
 * presentation layer's job, so this shared helper lives under
 * `app/components/common/`. Unparsable input returns the raw string, matching
 * each call site's prior guard.
 *
 * Despite the `DateTime` name, passing date-only options returns a date-only
 * string (`toLocaleString` honors the option set), so this is also the drop-in
 * replacement for prior `toLocaleDateString` call sites.
 */
export function formatJstDateTime(
  iso: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", { ...options, timeZone: "Asia/Tokyo" });
}
