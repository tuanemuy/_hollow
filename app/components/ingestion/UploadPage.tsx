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

export async function UploadPage({ user, includeDiscarded }: Props) {
  const { jobs } = await loadIngestionJobs(user.id, { includeDiscarded });

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
        {/* `key` forces a remount when the filter flips so IngestionQueue's
            `useState(initialJobs)` re-initialises with the newly filtered
            jobs instead of keeping the prior client state. */}
        <IngestionQueue
          key={includeDiscarded ? "with-discarded" : "default"}
          initialJobs={jobs}
          includeDiscarded={includeDiscarded}
        />
      </section>
    </>
  );
}
