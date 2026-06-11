import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { internalRouteHead } from "@/core/presentation/head";
import { validateInput } from "@/core/presentation/validator";

import "@/components/export/ExportForm/action";

const renderExportJobDetail = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(z.object({ jobId: z.string().min(1) })))
  .handler(async ({ data }) => {
    const { requireCurrentUser } = await import("@/lib/server/currentUser");
    const user = await requireCurrentUser();
    const [
      { ExportJobDetailPage, ExportJobNotFound },
      { loadExportJob },
      { isNotFoundError },
      { isBusinessRuleError },
      { ExportErrorCode },
    ] = await Promise.all([
      import("@/components/export/ExportJobDetail/Page"),
      import("@/components/export/ExportJobDetail/loader"),
      import("@/core/application/errors"),
      import("@/core/domain/error"),
      import("@/core/domain/export/errorCode"),
    ]);
    // Existence check stays in the handler.
    // This is a single-loader route, so the check fetches everything the
    // page needs — pass the DTO through instead of re-awaiting it behind
    // a Suspense boundary.
    try {
      const { job } = await loadExportJob({
        actorUserId: user.id,
        jobId: data.jobId,
      });
      return renderServerComponent(<ExportJobDetailPage job={job} />);
    } catch (error) {
      if (
        isNotFoundError(error) ||
        (isBusinessRuleError(error) &&
          error.code === ExportErrorCode.Unauthorized)
      ) {
        return renderServerComponent(<ExportJobNotFound />);
      }
      throw error;
    }
  });

export const Route = createFileRoute("/_app/exports/$jobId")({
  staleTime: 0,
  head: ({ match, params }) =>
    internalRouteHead(
      match.context?.config,
      "エクスポートジョブ",
      `/exports/${params.jobId}`,
    ),
  loader: ({ params }) =>
    renderExportJobDetail({ data: { jobId: params.jobId } }),
  component: ExportJobDetailRoute,
  errorComponent: () => (
    <div role="alert">
      <h1>エラーが発生しました</h1>
      <p>時間をおいて再度お試しください。</p>
    </div>
  ),
});

function ExportJobDetailRoute() {
  return Route.useLoaderData();
}
