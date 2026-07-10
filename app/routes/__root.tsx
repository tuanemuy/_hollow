import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { RouteProgressBar } from "@/components/layout/RouteProgressBar";
import { ErrorPage } from "@/components/public/ErrorPage";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";
import appCss from "../styles/index.css?url";

// Server fns only reachable from `"use client"` components miss the
// rsc manifest (frozen before the client build phase). Pull their
// provider modules into a server-rendered route to register them.
import "@/components/auth/AdminSignUpForm/action";
import "@/components/auth/EmailChangeConfirm/action";
import "@/components/auth/LoginForm/action";
import "@/components/auth/PasswordResetConfirmForm/action";
import "@/components/auth/PasswordResetRequestForm/action";
import "@/components/auth/SignUpForm/action";
import "@/components/auth/VerifyEmail/action";
import "@/components/public/ShareLinkGate/action";
// `reportSectionFailure` (Issue #647) is reached only through the
// `"use client"` `SectionErrorBoundary` chain, which the RSC build does not
// traverse statically (same #718 trap as `logOutAction`). `SectionErrorBoundary`
// is rendered from authenticated (`_app/*`), admin (`admin/*`) and public note
// (`u/*`, `notes/public/*`) routes alike, so it is registered here in the
// all-routes root server graph to cover every reachable route without leaving
// a gap that would 500 only on the unregistered route.
import "@/components/common/sectionFailureReport";

export const loadAppContext = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getContainer } = await import(
      "@/core/application/di/containerStore"
    );
    const container = await getContainer();
    return { config: container.config };
  });

// `beforeLoad` re-runs on every navigation and is not gated by `staleTime`,
// so calling `loadAppContext()` directly costs a `_serverFn` round trip per
// navigation (Issue #296). `config` is env-derived and immutable within a
// session, so the client fetches it once and reuses the promise. SSR must
// bypass the cache: the worker module scope is shared across requests, so a
// cached value would leak one request's config into another.
//
// A rejected fetch clears the slot so the next navigation retries, instead of
// poisoning every later navigation with the same cached failure.
let clientAppContext: ReturnType<typeof loadAppContext> | undefined;

function resolveAppContext(): ReturnType<typeof loadAppContext> {
  if (import.meta.env.SSR) return loadAppContext();
  clientAppContext ??= loadAppContext().catch((error) => {
    clientAppContext = undefined;
    throw error;
  });
  return clientAppContext;
}

const SITE_ASSET_LINKS = [
  { rel: "icon", href: "/favicon.ico", sizes: "any" },
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  { rel: "mask-icon", href: "/mask-icon.svg", color: "#1d1d1f" },
  { rel: "manifest", href: "/site.webmanifest" },
];

export const Route = createRootRoute({
  beforeLoad: () => resolveAppContext(),
  head: ({ match }) => {
    const stylesheet = { rel: "stylesheet", href: appCss };
    const baseLinks = [...SITE_ASSET_LINKS, stylesheet];
    const config = match.context?.config;
    if (!config) return { links: baseLinks };
    const { meta, links } = buildHead(config);
    // `canonical` is page-specific; this root layout cannot know the real
    // path, and every route-level `head` emits its own. Drop the root's "/"
    // canonical so pages don't render duplicate `<link rel="canonical">`
    // (crawlers ignore a page that declares more than one canonical).
    const linksWithoutCanonical = links.filter((l) => l.rel !== "canonical");
    return { meta, links: [...baseLinks, ...linksWithoutCanonical] };
  },
  // `shellComponent` wraps the whole match tree (component / error / notFound
  // boundaries alike) exactly once, so the `<html>/<head>/<body>` shell is
  // structurally guaranteed to be single. `notFoundComponent` renders inside
  // the root component's `<Outlet/>` (globalNotFound), so wrapping the shell in
  // each of `component`/`errorComponent`/`notFoundComponent` nested it twice on
  // notFound routes (e.g. `/notes`), duplicating `<meta charset>`/viewport.
  // Centralizing the shell here also keeps error/notFound screens covered by
  // the shell — now with a stronger guarantee, since it sits outside the error
  // boundary (Issue #827, ADR-001).
  shellComponent: RootDocument,
  component: RootComponent,
  errorComponent: ({ error }) => (
    <ErrorPage kind="system" message={sanitizeRouteError(error)} />
  ),
  notFoundComponent: () => <ErrorPage kind="notFound" />,
});

function RootComponent() {
  return <Outlet />;
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        {/* Global route-transition indicator (Issue #819). Placed in
            `RootDocument` — the `shellComponent`, which sits outside every
            component/error/notFound boundary — so it covers the root
            error/notFound screens' re-navigations exactly once (Issue #827);
            decorative + `opacity-0` when idle, so it is inert on those screens. */}
        <RouteProgressBar />
        {children}
        {import.meta.env.DEV ? <TanStackRouterDevtools /> : null}
        <Scripts />
      </body>
    </html>
  );
}
