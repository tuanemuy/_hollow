import type { AppConfig } from "@/core/application/di/types";

// 1200x630 — `summary_large_image` 互換サイズ。
const DEFAULT_OG_IMAGE_PATH = "/og-image.png";
const DEFAULT_LOCALE = "ja_JP";

export type HeadOverrides = Readonly<{
  title?: string;
  description?: string;
  path?: string;
  ogImage?: string;
  ogType?: "website" | "article";
  /** Emit `<meta name="robots" content="noindex, nofollow">` when true. */
  noIndex?: boolean;
  /** ISO-8601 string for `article:published_time` (article type only). */
  publishedTime?: string;
  /** ISO-8601 string for `article:modified_time` (article type only). */
  modifiedTime?: string;
  /** `article:author` (article type only). */
  authorName?: string;
  /** `article:tag` entries (article type only, one meta per tag). */
  tags?: readonly string[];
}>;

type MetaTag =
  | { charSet: string }
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string };

type LinkTag = { rel: string; href: string };

// TanStack Router の `head()` 戻り値型が mutable array を要求するため readonly 不可。
export type HeadConfig = {
  meta: MetaTag[];
  links: LinkTag[];
};

function isAbsoluteUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}

export function joinUrl(appUrl: string, pathOrUrl: string): string {
  if (isAbsoluteUrl(pathOrUrl)) return pathOrUrl;
  const base = appUrl.replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

export function buildHead(
  config: AppConfig,
  overrides: HeadOverrides = {},
): HeadConfig {
  const title = overrides.title ?? config.defaultTitle;
  const description = overrides.description ?? config.defaultDescription;
  const ogType = overrides.ogType ?? "website";
  const url = joinUrl(config.appUrl, overrides.path ?? "/");
  const ogImage = joinUrl(
    config.appUrl,
    overrides.ogImage ?? DEFAULT_OG_IMAGE_PATH,
  );

  const meta: MetaTag[] = [
    { charSet: "utf-8" },
    {
      name: "viewport",
      content: "width=device-width, initial-scale=1, viewport-fit=cover",
    },
    { title },
    { name: "description", content: description },
    { name: "theme-color", content: config.themeColor },
    { name: "format-detection", content: "telephone=no" },
    { name: "mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-capable", content: "yes" },
    { name: "apple-mobile-web-app-status-bar-style", content: "default" },
    { name: "apple-mobile-web-app-title", content: config.siteName },
    { property: "og:type", content: ogType },
    { property: "og:url", content: url },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:image", content: ogImage },
    { property: "og:site_name", content: config.siteName },
    { property: "og:locale", content: config.locale ?? DEFAULT_LOCALE },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: ogImage },
  ];
  if (config.twitterHandle !== undefined) {
    meta.push({ name: "twitter:site", content: config.twitterHandle });
  }
  if (overrides.noIndex === true) {
    meta.push({ name: "robots", content: "noindex, nofollow" });
  }
  if (ogType === "article") {
    if (overrides.publishedTime !== undefined) {
      meta.push({
        property: "article:published_time",
        content: overrides.publishedTime,
      });
    }
    if (overrides.modifiedTime !== undefined) {
      meta.push({
        property: "article:modified_time",
        content: overrides.modifiedTime,
      });
    }
    if (overrides.authorName !== undefined) {
      meta.push({ property: "article:author", content: overrides.authorName });
    }
    for (const tag of overrides.tags ?? []) {
      meta.push({ property: "article:tag", content: tag });
    }
  }

  const links: LinkTag[] = [{ rel: "canonical", href: url }];

  return { meta, links };
}

/**
 * `head` for an authenticated / internal route: emits a `<title>` for tab
 * identification plus `noindex, nofollow`. Returns `{}` when `config` is not
 * yet on the match context (SSR boot / first paint) so the route never throws.
 */
export function internalRouteHead(
  config: AppConfig | undefined,
  title: string,
  path: string,
): HeadConfig | Record<string, never> {
  if (!config) return {};
  return buildHead(config, {
    title: `${title} — ${config.siteName}`,
    path,
    noIndex: true,
  });
}

export type JsonLdScript = {
  type: "application/ld+json";
  children: string;
};

/**
 * Serializes a structured-data object into a `<script type="application/ld+json">`
 * payload. The `<` → `<` escape prevents a `</script>` sequence embedded
 * in user content (note title / body) from breaking out of the script element
 * (XSS). The escape is JSON-transparent: `<` parses back to `<`.
 */
export function buildJsonLdScript(data: object): JsonLdScript {
  const children = JSON.stringify(data).replace(/</g, "\\u003c");
  return { type: "application/ld+json", children };
}
