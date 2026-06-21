import { notFound } from "@tanstack/react-router";
import { isNotFoundError } from "@/core/application/errors";

/**
 * Runs a public resource's existence check inside the server-function handler
 * — before RSC rendering — and turns a missing resource into a router
 * `notFound`, so the SSR document responds with HTTP 404 instead of 200.
 *
 * Why this is needed: the document status is owned entirely by the router
 * (`router.stores.statusCode`), which only ever emits 404 (a thrown
 * `notFound`), 500 (a thrown error), a redirect status, or 200 (success). A
 * `setResponseStatus` call from a server-function handler writes the
 * server-function response, not the SSR document, so it never reaches the
 * status the crawler sees. And a `notFound` thrown from *inside* the RSC
 * component is swallowed during stream decode (Issue #599 / `.issue/12/adr.md`
 * ADR-004), which is why #599 returns an `ErrorPage` from the component rather
 * than throwing — that fixes the screen but leaves the status at 200. Checking
 * existence here, in the handler's await path before `renderServerComponent`,
 * is the only place a `notFound` reliably propagates to the document.
 *
 * The public read usecases collapse missing / private / unavailable into a
 * single `NotFoundError` (enumeration resistance), so every not-found case
 * maps to one 404. Non-`NotFoundError` throws propagate unchanged to
 * `errorResponseMiddleware` (500 / system). `check`'s result is discarded; the
 * body is fetched again during RSC render.
 *
 * The literal Issue #735 ask was 410 for notes, but the current TanStack
 * Router hardcodes a thrown `notFound` to 404 and exposes no path to a custom
 * document status, so 404 is the achievable non-200 status for all three
 * public routes (see `.issue/735/adr.md` ADR-001/ADR-004). The `gone` /
 * `notFound` screens are unchanged — the route `notFoundComponent`s still
 * render them.
 */
export async function ensurePublicResourceExists(
  check: () => Promise<unknown>,
): Promise<void> {
  try {
    await check();
  } catch (error) {
    if (isNotFoundError(error)) throw notFound();
    throw error;
  }
}
