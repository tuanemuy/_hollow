import { isNotFoundError } from "@/core/application/errors";
import type { ExportJobDTO } from "@/core/application/export/view";
import { isBusinessRuleError } from "@/core/domain/error";
import { ExportErrorCode } from "@/core/domain/export/errorCode";
import { requireCurrentUser } from "@/lib/server/currentUser";
import { ExportJobDetailView } from "./index";
import { loadExportJob } from "./loader";

/**
 * `getExportJob` が投げる `NotFoundError` と
 * `BusinessRuleError(ExportErrorCode.Unauthorized)` を区別せず、
 * 同一の中立メッセージ JSX を直接返す。両者を画面で識別不能にすることで
 * 他人のジョブの存在有無を漏らさない。詳細は `.issue/12/adr.md` の ADR-004。
 *
 * 注: TanStack Start の現バージョンでは、`renderServerComponent` 経由で
 * 実行される RSC コンポーネント内で `throw notFound()` を投げても
 * route の `notFoundComponent` に届かず、通常の error として errorComponent
 * に流れる挙動が確認されている。そのためここでは notFound() を経由せず
 * JSX を直接返す形を取る。
 */
export async function ExportJobDetailPage({ jobId }: { jobId: string }) {
  const user = await requireCurrentUser();
  let job: ExportJobDTO;
  try {
    ({ job } = await loadExportJob({ actorUserId: user.id, jobId }));
  } catch (error) {
    if (
      isNotFoundError(error) ||
      (isBusinessRuleError(error) &&
        error.code === ExportErrorCode.Unauthorized)
    ) {
      return (
        <main>
          <div role="alert">
            <h1>ジョブが見つかりません</h1>
            <p>ジョブが見つからないか、アクセス権限がありません。</p>
          </div>
        </main>
      );
    }
    throw error;
  }
  return (
    <main>
      <h1>エクスポートジョブ詳細</h1>
      <ExportJobDetailView job={job} />
    </main>
  );
}
