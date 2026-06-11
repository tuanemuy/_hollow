import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/common/ListPageSkeleton";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import { ExportJobsListView } from "./index";
import { loadExportJobs } from "./loader";

const PAGE_SIZE = 20;

type Props = { offset: number; userId: string };

/**
 * Export jobs page shell (Issue #636). The static heading renders
 * immediately; the job list streams behind its `<Suspense>` boundary.
 * Auth is resolved in the route handler (outside the boundary).
 */
export function ExportJobsPage({ offset, userId }: Props) {
  return (
    <main>
      <h1>エクスポートジョブ</h1>
      <SectionErrorBoundary section="エクスポートジョブの一覧">
        <Suspense
          fallback={
            <ListPageSkeleton ariaLabel="エクスポートジョブを読み込み中" />
          }
        >
          <JobsSection offset={offset} userId={userId} />
        </Suspense>
      </SectionErrorBoundary>
    </main>
  );
}

async function JobsSection({ offset, userId }: Props) {
  const { jobs } = await loadExportJobs({
    actorUserId: userId,
    limit: PAGE_SIZE,
    offset,
  });
  return <ExportJobsListView jobs={jobs} />;
}
