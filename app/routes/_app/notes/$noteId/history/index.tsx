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
        noteId={
          data.noteId as unknown as Parameters<
            typeof NoteHistoryList
          >[0]["noteId"]
        }
        page={data.page}
        limit={data.limit}
      />,
    );
  });

export const Route = createFileRoute("/_app/notes/$noteId/history/")({
  staleTime: 0,
  validateSearch: (search) => noteHistorySearchSchema.parse(search),
  loaderDeps: ({ search }) => search,
  // Issue #215: `noteHistorySearchSchema` keeps `page` / `limit`
  // optional on its output to drop the default pagination from the
  // URL; fall back to `1` / `20` here so the strict-typed server fn
  // still receives concrete numbers.
  loader: ({ params, deps }) =>
    renderHistory({
      data: {
        noteId: params.noteId,
        page: deps.page ?? 1,
        limit: deps.limit ?? 20,
      },
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
