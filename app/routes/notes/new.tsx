import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";

const renderNewNote = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    if (user === null) throw redirect({ to: "/" });
    const { AppShell } = await import("@/components/layout/AppShell");
    const { NoteEditor } = await import("@/components/note/NoteEditor");
    const { toUserDTO } = await import("@/core/application/dto/identity");
    return renderServerComponent(
      <AppShell user={toUserDTO(user)}>
        <NoteEditor mode="new" />
      </AppShell>,
    );
  });

export const Route = createFileRoute("/notes/new")({
  staleTime: 0,
  loader: () => renderNewNote(),
  component: NewNoteRoute,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
});

function NewNoteRoute() {
  return Route.useLoaderData();
}
