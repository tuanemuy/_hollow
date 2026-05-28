import type { RequestContainer } from "@/core/application/di/types";
import { listSitemapEntries } from "@/core/application/publication";
import { joinUrl } from "@/core/presentation/head";

const STATIC_PATHS = [
  "/",
  "/signup",
  "/login",
  "/search",
  "/terms",
  "/privacy",
  "/about",
] as const;

const EMPTY_URLSET_XML = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n`;

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildSitemapXml(
  entries: readonly { loc: string; lastmod?: string }[],
): string {
  const body = entries
    .map((e) => {
      const lastmod =
        e.lastmod !== undefined ? `    <lastmod>${e.lastmod}</lastmod>\n` : "";
      return `  <url>\n    <loc>${escapeXml(e.loc)}</loc>\n${lastmod}  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/**
 * Build the `/sitemap.xml` response.
 *
 * Lives in presentation because the TanStack Start file-route + server
 * function pipeline serialises return values through the RSC RPC layer,
 * which cannot emit a raw XML body. The Cloudflare entry point
 * (`app/server.cloudflare.ts`) intercepts `/sitemap.xml` before
 * delegating to the TanStack handler and calls this function directly.
 *
 * Static URLs are combined here (presentation knowledge) so the usecase
 * layer stays free of route definitions.
 *
 * On failure (D1 transient errors, UoW errors, etc.) logs via
 * `container.logger` and returns a 500 response with an empty
 * `urlset` body so crawlers still receive a well-formed XML document.
 */
export async function buildSitemapResponse(
  container: RequestContainer,
): Promise<Response> {
  const appUrl = container.config.appUrl;
  try {
    const staticEntries = STATIC_PATHS.map((p) => ({
      loc: joinUrl(appUrl, p),
    }));
    const { entries } = await listSitemapEntries({ container });
    const dynamicEntries = entries.map((e) => {
      const loc = joinUrl(appUrl, e.path);
      return e.lastmod !== undefined ? { loc, lastmod: e.lastmod } : { loc };
    });
    const xml = buildSitemapXml([...staticEntries, ...dynamicEntries]);
    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=600",
      },
    });
  } catch (cause) {
    container.logger.error("failed to build sitemap response", { cause });
    return new Response(EMPTY_URLSET_XML, {
      status: 500,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  }
}
