import type { DateRange } from "@/core/domain/note/valueObject";

/**
 * Normalise the 公開日範囲 URL params (`from` / `to`, `YYYY-MM-DD`) into the
 * domain `DateRange` VO. String→Date conversion lives here (presentation boundary).
 * The user's **inclusive** end date is pushed to day-after 00:00 UTC so the
 * half-open `[from, to)` contract is preserved while including the end date.
 * Returns `undefined` when neither bound is set.
 */
export function normalizePublicDateRange(
  from: string | undefined,
  to: string | undefined,
): DateRange | undefined {
  const fromDate = parseDateOnly(from);
  const toExclusive = to !== undefined ? nextDayUtc(to) : null;
  if (fromDate === null && toExclusive === null) return undefined;
  return { from: fromDate, to: toExclusive };
}

// `YYYY-MM-DD` → that day's UTC 00:00. Invalid format strings → null.
// (Route validator rejects malformed dates at the transport boundary.)
function parseDateOnly(date: string | undefined): Date | null {
  if (date === undefined) return null;
  const d = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// `YYYY-MM-DD` → the day **after** at UTC 00:00 (the exclusive upper bound for
// an inclusive end date). Invalid / absent input → null.
function nextDayUtc(date: string): Date | null {
  const start = parseDateOnly(date);
  if (start === null) return null;
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}
