import { requireAdminUser } from "@/lib/server/currentUser";
import { loadJobsSnapshot } from "./action";
import { JobsBoard } from "./index";

export async function JobsPage() {
  await requireAdminUser();
  const { ingestionJobs, exportJobs } = await loadJobsSnapshot();
  return (
    <main className="admin-main">
      <h1 className="admin-page-title">ジョブ監視</h1>
      <p className="admin-page-subtitle">
        全ユーザーの取り込み・エクスポートジョブの状況と、定期クリーンアップの概要。
      </p>
      <JobsBoard ingestionJobs={ingestionJobs} exportJobs={exportJobs} />
    </main>
  );
}
