/**
 * Format a byte count as a fixed-unit megabyte label (`"X.X MB"`): always
 * megabytes, always one decimal place, regardless of magnitude. Shared
 * presentation helper — formatting is the presentation layer's job.
 *
 * This is the single source of truth for the upload/size-cap UIs that present
 * a flat MB figure (media validation, note media uploader, ingestion upload
 * form, audio recorder). The label is `1024 * 1024`-based and never switches
 * units, so e.g. 5 GiB reads as `"5120.0 MB"`.
 *
 * Intentionally distinct from the variable-unit `formatBytes` family
 * (admin dashboards, account-deletion, export job detail) that auto-selects
 * B/KB/MB/GB and varies the decimal count. Those have a different formatting
 * policy and must not be folded into this helper, or their output would change.
 */
export function formatMegabytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
