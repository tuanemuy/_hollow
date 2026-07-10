/**
 * Format a byte count as a fixed-unit megabyte label (`"X.X MB"`): always
 * megabytes, always one decimal place, regardless of magnitude. The label is
 * `1024 * 1024`-based and never switches units, so e.g. 5 GiB reads as
 * `"5120.0 MB"`. Single source of truth for the upload/size-cap UIs.
 *
 * Intentionally distinct from the variable-unit {@link formatBytes}: a
 * different formatting policy, so folding them together would change one
 * side's output. This file is the two-function set "variable-unit =
 * {@link formatBytes} / fixed-MB = {@link formatMegabytes}".
 */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format a byte count as a variable-unit label, auto-selecting the largest
 * unit that keeps the number readable across `B/KB/MB/GB/TB` (`1024`-based).
 * Decimals vary: whole `B` and values `>= 100` render with no decimal, the
 * rest with one (so `1024` reads as `"1.0 KB"`, `1023` as `"1023 B"`). `null`
 * renders as `"—"` (U+2014 EM DASH) for missing/unknown totals, `0` as
 * `"0 B"`, and magnitudes past `TB` clamp to `TB`. Single source of truth for
 * the admin storage/limits and account-deletion impact UIs.
 *
 * Humanizing a raw byte total is a presentation concern (#573); this shared
 * helper is where that concern lives (extracted in #799).
 *
 * Intentionally distinct from the fixed-unit {@link formatMegabytes} (always
 * MB, always one decimal): a different formatting policy, so folding them
 * together would change one side's output.
 */
export function formatBytes(value: number | null): string {
  if (value === null) return "—";
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  const scaled = value / 1024 ** i;
  return `${scaled.toFixed(scaled >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}
