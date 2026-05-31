import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
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
// so calling `loadAppContext()` directly fired a `_serverFn` round trip per
// navigation (Issue #296). `config` is env-derived and immutable within a
// session, so the client fetches it once and reuses the promise. SSR must
// bypass this cache — the worker module scope is shared across requests, so
// caching here would leak one request's config into another.
//
// Only a resolved promise is cached: a rejected fetch (transient 5xx, network
// blip) clears the slot so the next navigation retries, rather than poisoning
// every subsequent navigation with the same failure.
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
    return { meta, links: [...baseLinks, ...links] };
  },
  component: RootComponent,
  errorComponent: ({ error }) => (
    <RootDocument>
      <ErrorPage kind="system" message={sanitizeRouteError(error)} />
    </RootDocument>
  ),
  notFoundComponent: () => (
    <RootDocument>
      <ErrorPage kind="notFound" />
    </RootDocument>
  ),
});

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {import.meta.env.DEV ? <TanStackRouterDevtools /> : null}
        <Scripts />
      </body>
    </html>
  );
}
