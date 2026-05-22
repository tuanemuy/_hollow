import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { HOME_SEARCH } from "@/components/auth/links";
import { noteHistorySearchSchema } from "@/components/note/schema";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
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
    if (user === null) throw redirect({ to: "/", search: HOME_SEARCH });
    const { AppShell } = await import("@/components/layout/AppShell");
    const { NoteHistoryList } = await import(
      "@/components/note/history/NoteHistoryList"
    );
    const { toUserDTO } = await import("@/core/application/dto/identity");
    const userDto = toUserDTO(user);
    return renderServerComponent(
      <AppShell user={userDto}>
        <NoteHistoryList
          user={userDto}
          noteId={
            data.noteId as unknown as Parameters<
              typeof NoteHistoryList
            >[0]["noteId"]
          }
          page={data.page}
          limit={data.limit}
        />
      </AppShell>,
    );
  });

export const Route = createFileRoute("/notes/$noteId/history/")({
  staleTime: 0,
  validateSearch: (search) => noteHistorySearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) =>
    renderHistory({
      data: { noteId: params.noteId, page: deps.page, limit: deps.limit },
    }),
  component: NoteHistoryRoute,
  errorComponent: ({ error }) => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <pre>{sanitizeRouteError(error)}</pre>
    </div>
  ),
  notFoundComponent: () => (
    <div role="alert">
      <h1>ノートが見つかりません</h1>
      <p>削除されているか、アクセス権限がありません。</p>
    </div>
  ),
});

function NoteHistoryRoute() {
  return Route.useLoaderData();
}
