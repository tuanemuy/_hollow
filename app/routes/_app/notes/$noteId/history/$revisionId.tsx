import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { HOME_SEARCH } from "@/components/auth/links";
import { RouteErrorFallback } from "@/components/layout/RouteErrorFallback";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";
import { validateInput } from "@/core/presentation/validator";

const renderRevision = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(
    validateInput(
      z.object({
        noteId: z.string().min(1),
        revisionId: z.string().min(1),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    // Defensive: `_app.beforeLoad` guarantees a user here, but keep a
    // 1-line fail-safe so a future routing change cannot leak through.
    if (user === null) throw redirect({ to: "/", search: HOME_SEARCH });
    const { NoteRevisionDetail } = await import(
      "@/components/note/history/NoteRevisionDetail"
    );
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);
    return renderServerComponent(
      <NoteRevisionDetail
        user={userDto}
        noteId={data.noteId}
        revisionId={data.revisionId}
      />,
    );
  });

export const Route = createFileRoute("/_app/notes/$noteId/history/$revisionId")(
  {
    staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
    head: ({ match, params }) => {
      const config = match.context?.config;
      if (!config) return {};
      return buildHead(config, {
        title: `過去版 — ${config.siteName}`,
        path: `/notes/${params.noteId}/history/${params.revisionId}`,
        noIndex: true,
      });
    },
    loader: ({ params }) =>
      renderRevision({
        data: { noteId: params.noteId, revisionId: params.revisionId },
      }),
    component: NoteRevisionRoute,
    errorComponent: RouteErrorFallback,
  },
);

function NoteRevisionRoute() {
  return Route.useLoaderData();
}
