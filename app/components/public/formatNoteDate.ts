/**
 * Date formatting for the public surfaces.
 *
 * `formatDate()` / `formatPublishedDate()` use UTC (to keep SSR/CSR values
 * consistent). `formatRelativeDate()` operates on local calendar dates
 * ("today" / "yesterday" computed in browser timezone).
 */
export function formatDate(date: Date): string {
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日 更新`;
}

export function formatShort(date: Date): string {
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

/**
 * Published date metadata: "YYYY年M月D日 公開". Uses UTC for SSR/CSR consistency.
 */
export function formatPublishedDate(date: Date): string {
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日 公開`;
}

/**
 * Relative date label: "today" / "yesterday" / "M月D日" (same year) /
 * "YYYY年M月D日". Operates in local calendar time (browser timezone), not UTC.
 */
export function formatRelativeDate(date: Date, now: Date): string {
  if (Number.isNaN(date.getTime())) return "";
  const startOfDay = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((startOfDay(now) - startOfDay(date)) / oneDay);
  if (diffDays === 0) return "今日";
  if (diffDays === 1) return "昨日";
  const sameYear = date.getFullYear() === now.getFullYear();
  return sameYear
    ? `${date.getMonth() + 1}月${date.getDate()}日`
    : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}
