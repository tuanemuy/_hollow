import type { UserDTO } from "@/core/application/dto/identity";
import { EMPTY_STATE, PAGE_SUBTITLE, PAGE_TITLE } from "../layout/styles";
import { IngestionJobRow } from "./IngestionJobRow";
import { loadIngestionJobs } from "./loaders";
import { UploadForm } from "./UploadForm";

type Props = {
  user: UserDTO;
};

export async function UploadPage({ user }: Props) {
  const { jobs } = await loadIngestionJobs(user.id);

  return (
    <>
      <h1 className={PAGE_TITLE}>アップロード</h1>
      <p className={PAGE_SUBTITLE}>
        裏で進行中・失敗・プレビュー保留のアップロードを管理する画面です。新規取り込みはヘッダーの「アップロード」ボタンから開くモーダルで完結します。
      </p>

      <UploadForm />

      <section className="mt-12">
        <h2 className="text-xl font-semibold mb-4">取り込みキュー</h2>
        {jobs.length === 0 ? (
          <div className={EMPTY_STATE}>
            <h2 className="text-xl font-medium text-ink mb-2">
              まだジョブがありません
            </h2>
            <p className="text-sm">
              ファイルをアップロードすると、ここに進行状況が表示されます。
            </p>
          </div>
        ) : (
          <div>
            {jobs.map((job) => (
              <IngestionJobRow key={job.id as unknown as string} job={job} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
