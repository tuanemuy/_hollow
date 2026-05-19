import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { HOME_SEARCH } from "@/components/auth/links";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

const renderTags = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    if (user === null) throw redirect({ to: "/", search: HOME_SEARCH });
    const { AppShell } = await import("@/components/layout/AppShell");
    const { TagManager } = await import("@/components/tag/TagManager");
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);
    return renderServerComponent(
      <AppShell user={userDto}>
        <TagManager user={userDto} />
      </AppShell>,
    );
  });

export const Route = createFileRoute("/tags/")({
  staleTime: 0,
  loader: () => renderTags(),
  component: TagsRoute,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function TagsRoute() {
  return Route.useLoaderData();
}
