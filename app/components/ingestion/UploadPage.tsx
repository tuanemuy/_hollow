import type { UserDTO } from "@/core/application/dto/identity";
import { PAGE_SUBTITLE, PAGE_TITLE } from "../layout/styles";
import { IngestionQueue } from "./IngestionQueue";
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
        <IngestionQueue initialJobs={jobs} />
      </section>
    </>
  );
}
