/**
 * Format an ISO 8601 instant as a Japanese relative time for list-style
 * timestamps (P22 "最終アクセス", and reusable elsewhere). Shared
 * presentation helper — formatting is the presentation layer's job.
 *
 * Buckets: "たった今" (within {@link JUST_NOW_MS}) → "N 分前" → "N 時間前"
 * → "N 日前", and past {@link ABSOLUTE_THRESHOLD_DAYS} it falls back to an
 * absolute `ja-JP` date. The "たった今" window is kept ≥ the session
 * activity throttle (`ACTIVITY_THROTTLE_MS`, #615 ADR-003 / ADR-004) so a
 * just-active session does not read as "N 分前".
 *
 * `now` is injectable for deterministic tests; it defaults to the current
 * time. Future instants (clock skew) collapse to "たった今".
 */
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const JUST_NOW_MS = 5 * MINUTE_MS;
const ABSOLUTE_THRESHOLD_DAYS = 7;

export function formatRelativeTime(
  instant: string,
  now: Date = new Date(),
): string {
  const then = new Date(instant).getTime();
  const diff = now.getTime() - then;

  if (diff < JUST_NOW_MS) return "たった今";
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} 分前`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)} 時間前`;

  const days = Math.floor(diff / DAY_MS);
  if (days < ABSOLUTE_THRESHOLD_DAYS) return `${days} 日前`;

  return new Date(instant).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
