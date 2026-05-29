import { z } from "zod";

/**
 * URL search schema for the `/upload` route's "show discarded" toggle.
 *
 * `includeDiscarded` accepts a real boolean (from
 * `router.navigate({ search: { includeDiscarded: true } })`) as well as the
 * forms a hand-typed URL can carry. TanStack Router's default search parser
 * is JSON-based, so `?includeDiscarded=1` arrives as the **number** `1` and
 * `=true` as the **boolean** `true` — only a non-JSON value like `?x=abc`
 * stays a string. We therefore accept boolean / number / string and treat
 * `true` / `1` / `"1"` / `"true"` as ON; every other value (`0`, `"false"`,
 * an arbitrary string) collapses to `false`, and an absent param stays
 * `undefined`. The loader re-defaults at a single boundary (`?? false`), and
 * the toggle drops the param entirely when switching OFF so the URL stays
 * clean (Issue #215). `.catch(undefined)` is the belt-and-braces fallback so
 * no URL shape can error the route.
 */
export const uploadSearchSchema = z.object({
  includeDiscarded: z
    .union([z.boolean(), z.number(), z.string()])
    .transform((v) => v === true || v === 1 || v === "1" || v === "true")
    .optional()
    .catch(undefined),
});

export type UploadSearch = z.infer<typeof uploadSearchSchema>;
