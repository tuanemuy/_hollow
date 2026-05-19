import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { HOME_SEARCH } from "@/components/auth/links";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

const renderUpload = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    if (user === null) throw redirect({ to: "/", search: HOME_SEARCH });
    const { AppShell } = await import("@/components/layout/AppShell");
    const { UploadPage } = await import("@/components/ingestion/UploadPage");
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);
    return renderServerComponent(
      <AppShell user={userDto}>
        <UploadPage user={userDto} />
      </AppShell>,
    );
  });

export const Route = createFileRoute("/upload/")({
  staleTime: 0,
  loader: () => renderUpload(),
  component: UploadRoute,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function UploadRoute() {
  return Route.useLoaderData();
}
