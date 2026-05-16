/**
 * Common DTO primitives shared across the application layer.
 *
 * - `Instant` is the canonical wire representation of a point in time:
 *   an ISO 8601 UTC string (e.g. `2024-05-16T00:00:00.000Z`). Domain
 *   layer uses `Date`; DTOs always carry the string form.
 * - `DateRange` is the DTO projection of the various domain `DateRange`
 *   value objects (note / view / export / search). Both bounds are
 *   optional half-open `[from, to)` semantics.
 * - `Pagination` / `PaginationResult` mirror the domain pagination
 *   primitives but live here so usecase signatures do not have to import
 *   from the domain layer.
 */

export type Instant = string;

export type DateRange = Readonly<{
  from: Instant | null;
  to: Instant | null;
}>;

export type Pagination = Readonly<{
  page: number;
  limit: number;
}>;

export type PaginationResult<T> = Readonly<{
  items: readonly T[];
  count: number;
}>;

/** Convert a `Date` to its `Instant` (ISO 8601 UTC) representation. */
export function toInstant(value: Date): Instant {
  return value.toISOString();
}

/** Convert a nullable `Date` to a nullable `Instant`. */
export function toInstantOrNull(value: Date | null): Instant | null {
  return value === null ? null : value.toISOString();
}

/**
 * User-facing alert surfaced by usecases and rendered by the presentation
 * layer (toasts, banners). Severity ladder matches the domain
 * `RegistrationPolicy` / quota subsystems.
 */
export type AlertDTO = Readonly<{
  code: string;
  message: string;
  severity: "info" | "warning" | "critical";
}>;
