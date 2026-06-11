import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/common/ListPageSkeleton";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import type { UserDTO } from "@/core/application/dto/identity";
import { PAGE_SUBTITLE, PAGE_TITLE } from "../layout/styles";
import { DiscardedToggle } from "./DiscardedToggle";
import { IngestionQueue } from "./IngestionQueue";
import { loadIngestionJobs } from "./loaders";
import { UploadForm } from "./UploadForm";

type Props = {
  user: UserDTO;
  includeDiscarded: boolean;
};

/**
 * Upload page shell (Issue #636). The static chrome (title, subtitle,
 * form, toggle) renders immediately; only the job queue streams behind
 * its `<Suspense>` boundary. Queue progress polling is client-side
 * inside `IngestionQueue` (no loader re-run), so the boundary does not
 * flicker on poll ticks.
 */
export function UploadPage({ user, includeDiscarded }: Props) {
  return (
    <>
      <h1 className={PAGE_TITLE}>アップロード</h1>
      <p className={PAGE_SUBTITLE}>
        裏で進行中・失敗・プレビュー保留のアップロードを管理する画面です。新規取り込みはヘッダーの「アップロード」ボタンから開くモーダルで完結します。
      </p>

      <UploadForm />

      <section className="mt-12">
        <div className="flex justify-end mb-4">
          <DiscardedToggle />
        </div>
        <SectionErrorBoundary section="アップロードの一覧">
          <Suspense
            fallback={<ListPageSkeleton ariaLabel="アップロードを読み込み中" />}
          >
            <QueueSection user={user} includeDiscarded={includeDiscarded} />
          </Suspense>
        </SectionErrorBoundary>
      </section>
    </>
  );
}

async function QueueSection({ user, includeDiscarded }: Props) {
  const { jobs } = await loadIngestionJobs(user.id, { includeDiscarded });
  return (
    /* `key` forces a remount when the filter flips so IngestionQueue's
       `useState(initialJobs)` re-initialises with the newly filtered
       jobs instead of keeping the prior client state. */
    <IngestionQueue
      key={includeDiscarded ? "with-discarded" : "default"}
      initialJobs={jobs}
      includeDiscarded={includeDiscarded}
    />
  );
}
