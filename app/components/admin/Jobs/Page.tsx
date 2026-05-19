import { requireAdminUser } from "@/lib/server/currentUser";
import { loadJobsSnapshot } from "./action";
import { JobsBoard } from "./index";

export async function JobsPage() {
  await requireAdminUser();
  const { ingestionJobs, exportJobs } = await loadJobsSnapshot();
  return (
    <main className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] pt-10 pb-20">
      <h1 className="text-3xl font-regular tracking-tightest leading-tight m-0 mb-2">
        ジョブ監視
      </h1>
      <p className="text-md text-ink-secondary m-0 mb-8">
        全ユーザーの取り込み・エクスポートジョブの状況と、定期クリーンアップの概要。
      </p>
      <JobsBoard ingestionJobs={ingestionJobs} exportJobs={exportJobs} />
    </main>
  );
}
