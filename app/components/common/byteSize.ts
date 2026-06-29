/**
 * Format a byte count as a fixed-unit megabyte label (`"X.X MB"`): always
 * megabytes, always one decimal place, regardless of magnitude. The label is
 * `1024 * 1024`-based and never switches units, so e.g. 5 GiB reads as
 * `"5120.0 MB"`. Single source of truth for the upload/size-cap UIs.
 *
 * Intentionally distinct from the variable-unit `formatBytes` family that
 * auto-selects B/KB/MB/GB and varies the decimal count: a different formatting
 * policy, so folding them together would change one side's output.
 */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
