import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";

const renderSpeechSettingsPage = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .handler(async () => {
    const { requireAdminUser } = await import("@/lib/server/currentUser");
    const actor = await requireAdminUser();
    const { SpeechSettingsPage } = await import(
      "@/components/admin/SpeechSettingsForm/Page"
    );
    return renderServerComponent(<SpeechSettingsPage actorId={actor.id} />);
  });

export const Route = createFileRoute("/admin/speech")({
  staleTime: import.meta.env.DEV ? 0 : Number.POSITIVE_INFINITY,
  head: ({ match }) =>
    internalRouteHead(match.context?.config, "文字起こし設定", "/admin/speech"),
  loader: () => renderSpeechSettingsPage(),
  component: AdminSpeechPage,
});

function AdminSpeechPage() {
  return Route.useLoaderData();
}
