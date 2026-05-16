import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { LandingPage } from "@/components/landing/LandingPage";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";

// Pull server-fn provider modules into the server graph so the RSC
// manifest registers them before the client build phase. Without these,
// "use client" components that import the action files at runtime hit a
// missing-handler error.
import "@/components/note/actions";
import "@/components/directory/actions";
import "@/components/tag/actions";
import "@/components/ingestion/actions";

// Home is keyless: pagination defaults are baked in. Search-driven
// filtering (tag / directory / keyword) is handled by /search and the
// filter UI inside the home page tree.
const renderHome = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    if (user === null) {
      return { authenticated: false as const };
    }
    const { HomePage } = await import("@/components/note/HomePage");
    const { toUserDTO } = await import("@/core/application/dto/identity");
    return {
      authenticated: true as const,
      Home: await renderServerComponent(
        <HomePage user={toUserDTO(user)} page={1} limit={20} />,
      ),
    };
  });

export const Route = createFileRoute("/")({
  staleTime: 0,
  loader: () => renderHome(),
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    const { meta, links } = buildHead(config, { path: "/" });
    return { meta, links };
  },
  component: HomeRoute,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function HomeRoute() {
  const data = Route.useLoaderData();
  if (!data.authenticated) return <LandingPage />;
  return data.Home;
}
