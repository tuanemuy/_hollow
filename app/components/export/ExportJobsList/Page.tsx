import { requireCurrentUser } from "@/lib/server/currentUser";
import { ExportJobsListView } from "./index";
import { loadExportJobs } from "./loader";

const PAGE_SIZE = 20;

export async function ExportJobsPage({ offset }: { offset: number }) {
  const user = await requireCurrentUser();
  const { jobs } = await loadExportJobs({
    actorUserId: user.id,
    limit: PAGE_SIZE,
    offset,
  });
  return (
    <main>
      <h1>エクスポートジョブ</h1>
      <ExportJobsListView jobs={jobs} />
    </main>
  );
}
