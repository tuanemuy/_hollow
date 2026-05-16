import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ErrorPage, type ErrorPageKind } from "@/components/public/ErrorPage";
import { buildHead } from "@/core/presentation/head";

const errorKindEnum = z.enum(["notFound", "forbidden", "gone", "system"]);

const errorSearchSchema = z.object({
  kind: errorKindEnum.catch("notFound"),
  message: z.string().max(1000).optional(),
});

export const Route = createFileRoute("/error")({
  validateSearch: (search) => errorSearchSchema.parse(search),
  head: ({ match }) => {
    const config = match.context?.config;
    if (!config) return {};
    return buildHead(config, {
      title: `エラー — ${config.siteName}`,
      path: "/error",
    });
  },
  component: ErrorRoutePage,
});

function ErrorRoutePage() {
  const search = Route.useSearch();
  const kind: ErrorPageKind = search.kind;
  return (
    <ErrorPage
      kind={kind}
      {...(search.message !== undefined ? { message: search.message } : {})}
    />
  );
}
