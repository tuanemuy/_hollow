import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import {
  paginationSchema,
  paginationSearchSchema,
} from "@/core/presentation/pagination";
import { validateInput } from "@/core/presentation/validator";

const renderTrash = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(paginationSchema))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    if (user === null) throw redirect({ to: "/" });
    const { AppShell } = await import("@/components/layout/AppShell");
    const { TrashList } = await import("@/components/trash/TrashList");
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);
    return renderServerComponent(
      <AppShell user={userDto}>
        <TrashList user={userDto} page={data.page} limit={data.limit} />
      </AppShell>,
    );
  });

export const Route = createFileRoute("/trash/")({
  staleTime: 0,
  validateSearch: (search) => paginationSearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => renderTrash({ data: deps }),
  component: TrashRoute,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function TrashRoute() {
  return Route.useLoaderData();
}
