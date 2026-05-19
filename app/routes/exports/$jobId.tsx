import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { renderServerComponent } from "@tanstack/react-start/rsc";
import { z } from "zod";
import type { ExportJobId } from "@/core/domain/export/valueObject";
import { errorResponseMiddleware } from "@/core/presentation/errorResponseMiddleware";
import { validateInput } from "@/core/presentation/validator";

import "@/components/export/ExportForm/action";

const renderExportJobDetail = createServerFn({ method: "GET" })
  .middleware([errorResponseMiddleware])
  .inputValidator(validateInput(z.object({ jobId: z.string().min(1) })))
  .handler(async ({ data }) => {
    const { ExportJobDetailPage } = await import(
      "@/components/export/ExportJobDetail/Page"
    );
    return renderServerComponent(
      <ExportJobDetailPage jobId={data.jobId as unknown as ExportJobId} />,
    );
  });

export const Route = createFileRoute("/exports/$jobId")({
  staleTime: 0,
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
