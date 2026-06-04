import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { sanitizeRouteError } from "@/core/presentation/errorDisplay";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";
import { validateInput } from "@/core/presentation/validator";

const renderPublishSettings = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(z.object({ noteId: z.string().min(1) })))
  .handler(async ({ data }) => {
    const { getContainer } = await import(
      "@/core/application/di/containerStore"
    );
    const container = await getContainer();
    const { PublishSettingsPage } = await import(
      "@/components/publication/PublishSettings/PublishSettingsPage"
    );
    return renderServerComponent(
      <PublishSettingsPage
        noteId={data.noteId}
        appUrl={container.config.appUrl}
      />,
    );
  });

export const Route = createFileRoute("/_app/notes/$noteId/publish")({
  staleTime: 0,
  head: ({ match, params }) =>
    internalRouteHead(
      match.context?.config,
      "公開設定",
      `/notes/${params.noteId}/publish`,
    ),
  loader: ({ params }) =>
    renderPublishSettings({ data: { noteId: params.noteId } }),
  component: PublishRoute,
  errorComponent: ({ error }) => (
    <div role="alert" className="p-6">
      <h1 className="text-xl font-semibold mb-3">エラーが発生しました</h1>
      <pre className="text-sm text-ink-secondary whitespace-pre-wrap">
        {sanitizeRouteError(error)}
      </pre>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-ink-secondary">ノートが見つかりません</div>
  ),
});

function PublishRoute() {
  return Route.useLoaderData();
}
