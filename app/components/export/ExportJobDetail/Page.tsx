import { isNotFoundError } from "@/core/application/errors";
import { isBusinessRuleError } from "@/core/domain/error";
import { ExportErrorCode } from "@/core/domain/export/errorCode";
import type { ExportJobId } from "@/core/domain/export/valueObject";
import { requireCurrentUser } from "@/lib/server/currentUser";
import { ExportJobDetailView } from "./index";
import { loadExportJob } from "./loader";

/**
 * `getExportJob` が投げる `NotFoundError` と
 * `BusinessRuleError(ExportErrorCode.Unauthorized)` を区別せず、
 * 同一の中立メッセージで返す。両者を画面で識別不能にすることで他人の
 * ジョブの存在有無を漏らさない。詳細は `.issue/12/adr.md` の ADR-004。
 */
export async function ExportJobDetailPage({ jobId }: { jobId: ExportJobId }) {
  const user = await requireCurrentUser();
  try {
    const { job } = await loadExportJob({
      actorUserId: user.id,
      jobId,
    });
    return (
      <main>
        <h1>エクスポートジョブ詳細</h1>
        <ExportJobDetailView job={job} />
      </main>
    );
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
}
