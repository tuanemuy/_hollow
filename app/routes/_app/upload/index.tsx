import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { HOME_SEARCH } from "@/components/auth/links";
import { uploadSearchSchema } from "@/components/ingestion/uploadSearch";
import { RouteErrorFallback } from "@/components/layout/RouteErrorFallback";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";
import { validateInput } from "@/core/presentation/validator";

const renderUpload = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  // Strict boolean for the RPC boundary — no `.default()`: the loader is
  // the single re-default point (`deps.includeDiscarded ?? false`), keeping
  // the URL-coercing search schema and this RPC schema separate contracts.
  .inputValidator(validateInput(z.object({ includeDiscarded: z.boolean() })))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    // Defensive: `_app.beforeLoad` guarantees a user here, but keep a
    // 1-line fail-safe so a future routing change cannot leak through.
    if (user === null) throw redirect({ to: "/", search: HOME_SEARCH });
    const { UploadPage } = await import("@/components/ingestion/UploadPage");
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);
    return renderServerComponent(
      <UploadPage user={userDto} includeDiscarded={data.includeDiscarded} />,
    );
  });

export const Route = createFileRoute("/_app/upload/")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  validateSearch: (search) => uploadSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `アップロード — ${config.siteName}`,
      path: "/upload",
      noIndex: true,
    });
  },
  loader: ({ deps }) =>
    renderUpload({
      data: { includeDiscarded: deps.includeDiscarded ?? false },
    }),
  component: UploadRoute,
  errorComponent: RouteErrorFallback,
});

function UploadRoute() {
  return Route.useLoaderData();
}
