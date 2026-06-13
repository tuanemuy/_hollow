import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { HOME_SEARCH } from "@/components/auth/links";
import { RouteErrorFallback } from "@/components/layout/RouteErrorFallback";
import {
  NOTE_HISTORY_DEFAULT_LIMIT,
  NOTE_HISTORY_DEFAULT_PAGE,
  noteHistorySearchSchema,
} from "@/components/note/schema";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { buildHead } from "@/core/presentation/head";
import { validateInput } from "@/core/presentation/validator";

const renderHistory = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(
    validateInput(
      z.object({
        noteId: z.string().min(1),
        page: z.number().int().min(1),
        limit: z.number().int().min(1).max(100),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const { getCurrentUser } = await import("@/lib/server/currentUser");
    const user = await getCurrentUser();
    // Defensive: `_app.beforeLoad` guarantees a user here, but keep a
    // 1-line fail-safe so a future routing change cannot leak through.
    if (user === null) throw redirect({ to: "/", search: HOME_SEARCH });
    const { NoteHistoryList } = await import(
      "@/components/note/history/NoteHistoryList"
    );
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);
    return renderServerComponent(
      <NoteHistoryList
        user={userDto}
        noteId={data.noteId}
        page={data.page}
        limit={data.limit}
      />,
    );
  });

export const Route = createFileRoute("/_app/notes/$noteId/history/")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  validateSearch: (search) => noteHistorySearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  head: ({ match, params }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `変更履歴 — ${config.siteName}`,
      path: `/notes/${params.noteId}/history`,
      noIndex: true,
    });
  },
  // Issue #215: `noteHistorySearchSchema` keeps `page` / `limit`
  // optional on its output to drop the default pagination from the
  // URL; re-default at the loader boundary so the strict-typed server
  // fn keeps receiving concrete numbers.
  loader: ({ params, deps }) =>
    renderHistory({
      data: {
        noteId: params.noteId,
        page: deps.page ?? NOTE_HISTORY_DEFAULT_PAGE,
        limit: deps.limit ?? NOTE_HISTORY_DEFAULT_LIMIT,
      },
    }),
  component: NoteHistoryRoute,
  errorComponent: RouteErrorFallback,
});

function NoteHistoryRoute() {
  return Route.useLoaderData();
}
