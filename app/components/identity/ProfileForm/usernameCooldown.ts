import { USERNAME_CHANGE_COOLDOWN_MS } from "@/core/domain/identity/entity";

/**
 * Compute the next date a username may be changed, or `null` when no hint
 * should be shown.
 *
 * Returns `null` when the username was never changed (`lastUsernameChangedAt`
 * is `null`) or when the cooldown has already elapsed — surfacing a date in
 * those cases would be a false claim (the change is already permitted). Only
 * a still-active cooldown produces a concrete `next` date, so the displayed
 * "次に変更できるのは … 以降です" hint is always truthful.
 *
 * @param lastUsernameChangedAt ISO 8601 instant of the last username change,
 *   or `null` if never changed.
 * @param now current time used to test whether the cooldown is still active.
 */
export function nextUsernameChangeAt(
  lastUsernameChangedAt: string | null,
  now: Date,
): Date | null {
  if (lastUsernameChangedAt === null) {
    return null;
  }
  const changedAt = new Date(lastUsernameChangedAt);
  if (Number.isNaN(changedAt.getTime())) {
    return null;
  }
  const next = new Date(changedAt.getTime() + USERNAME_CHANGE_COOLDOWN_MS);
  if (next.getTime() <= now.getTime()) {
    return null;
  }
  return next;
}
