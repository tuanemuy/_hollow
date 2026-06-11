import type { DateRange } from "@/core/domain/note/valueObject";

/**
 * Normalise the P30 公開日範囲 URL params (`from` / `to`, `YYYY-MM-DD`) into the
 * domain `DateRange` VO for `listUserPublicNotes` (#619 ADR-006).
 *
 * The string→Date conversion lives at this presentation boundary so the
 * usecase only ever sees the VO. The `DateRange` half-open `[from, to)`
 * contract is preserved: the user-chosen `to` is an **inclusive** end date, so
 * it is pushed to the day-after 00:00 (UTC) and the adapter applies `lt`. That
 * keeps notes published on the end date itself inside the window without
 * redefining the VO's half-open semantics.
 *
 * Returns `undefined` when neither bound is set (no filter), so callers can
 * omit the field entirely.
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

// `YYYY-MM-DD` → that day's UTC 00:00. Invalid / absent input → null.
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
