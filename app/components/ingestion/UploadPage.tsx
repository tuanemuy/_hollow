import type { UserDTO } from "@/core/application/dto/identity";
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
      <h1 className="page-title">アップロード</h1>
      <p className="page-subtitle">
        ファイルから新規ノートを作成します。HTML / Markdown / Office / PDF /
        画像 / 音声に対応しています。
      </p>

      <UploadForm />

      <section style={{ marginTop: "var(--space-12)" }}>
        <h2
          style={{
            fontSize: "var(--text-xl)",
            fontWeight: "var(--weight-semibold)",
            marginBottom: "var(--space-4)",
          }}
        >
          取り込みキュー
        </h2>
        {jobs.length === 0 ? (
          <div className="empty-state">
            <h2>まだジョブがありません</h2>
            <p>ファイルをアップロードすると、ここに進行状況が表示されます。</p>
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
