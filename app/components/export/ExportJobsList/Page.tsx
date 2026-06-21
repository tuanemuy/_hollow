import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/common/ListPageSkeleton";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import { PAGE_SUBTITLE, PAGE_TITLE } from "@/components/layout/styles";
import { EXPORT_MAIN_LIST } from "../styles";
import { ExportJobsListView } from "./index";
import { loadExportJobs } from "./loader";

const PAGE_SIZE = 20;

type Props = { offset: number; userId: string };

/**
 * Export jobs page shell. The static heading renders
 * immediately; the job list streams behind its `<Suspense>` boundary.
 * Auth is resolved in the route handler (outside the boundary).
 */
export function ExportJobsPage({ offset, userId }: Props) {
  return (
    <main className={EXPORT_MAIN_LIST}>
      <h1 className={PAGE_TITLE}>エクスポートジョブ</h1>
      <p className={PAGE_SUBTITLE}>
        過去のエクスポート履歴と進行中のジョブを確認できます。ダウンロードリンクは
        7 日間有効です。
      </p>
      <SectionErrorBoundary
        section="エクスポートジョブの一覧"
        resetKey={offset}
      >
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
