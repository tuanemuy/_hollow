import { z } from "zod";

/**
 * URL search schema for the `/media/<id>` route's `?download` flag.
 *
 * `?download=1` requests an attachment (named save) instead of inline
 * preview. TanStack Router's default search parser JSON-parses values,
 * so a bare `?download=1` arrives as the number `1` (not the string
 * "1"); accept the boolean, string, and number forms so the
 * `<a href="/media/<id>?download=1">` form works regardless of parsing.
 *
 * Kept in its own module (not the route file) so the route exports only
 * `Route`: a non-`Route` named export from a route file breaks the
 * TanStack Start server-fn code-split during the RSC build.
 */
export const mediaSearchSchema = z.object({
  download: z
    .union([
      z.boolean(),
      z.literal("1"),
      z.literal("0"),
      z.literal(1),
      z.literal(0),
    ])
    .optional()
    .transform((v) => v === true || v === "1" || v === 1),
});

export type MediaSearch = z.infer<typeof mediaSearchSchema>;

// Exported for regression testing: the `?download` flag must survive
// TanStack Router's JSON-parsing search reader, which turns a bare
// `?download=1` into the number `1` (see schema note above).
export const validateMediaSearch = (search: Record<string, unknown>) =>
  mediaSearchSchema.parse(search);
