import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { HOME_SEARCH } from "@/components/auth/links";
import { RouteErrorFallback } from "@/components/layout/RouteErrorFallback";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";
import { validateInput } from "@/core/presentation/validator";

const renderNoteDetail = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(z.object({ noteId: z.string().min(1) })))
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    // Defensive: `_app.beforeLoad` guarantees a user here, but keep a
    // 1-line fail-safe so a future routing change cannot leak through.
    if (user === null) throw redirect({ to: "/", search: HOME_SEARCH });
    const { getContainer } = await import(
      "@/core/application/di/containerStore"
    );
    const container = await getContainer();
    const { NoteDetail } = await import("@/components/note/detail/NoteDetail");
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);
    return renderServerComponent(
      <NoteDetail
        user={userDto}
        noteId={data.noteId}
        appUrl={container.config.appUrl}
      />,
    );
  });

export const Route = createFileRoute("/_app/notes/$noteId/")({
  staleTime: 0,
  head: ({ match, params }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `ノート — ${config.siteName}`,
      path: `/notes/${params.noteId}`,
      noIndex: true,
    });
  },
  loader: ({ params }) => renderNoteDetail({ data: { noteId: params.noteId } }),
  component: NoteDetailRoute,
  errorComponent: RouteErrorFallback,
});

function NoteDetailRoute() {
  return Route.useLoaderData();
}
