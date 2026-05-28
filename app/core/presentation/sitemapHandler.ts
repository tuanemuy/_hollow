import type { RequestContainer } from "@/core/application/di/types";
import { listSitemapEntries } from "@/core/application/publication/listSitemapEntries";

const STATIC_PATHS = [
  "/",
  "/signup",
  "/login",
  "/search",
  "/terms",
  "/privacy",
  "/about",
] as const;

function joinUrl(appUrl: string, path: string): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

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
 */
export async function buildSitemapResponse(
  container: RequestContainer,
): Promise<Response> {
  const appUrl = container.config.appUrl;
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
}
