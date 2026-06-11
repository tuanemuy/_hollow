import type { ExportJobDTO } from "@/core/application/export/view";
import { ExportJobDetailView } from "./index";

/**
 * `getExportJob` が投げる `NotFoundError` と
 * `BusinessRuleError(ExportErrorCode.Unauthorized)` を区別せず、
 * 同一の中立メッセージ JSX を返す。両者を画面で識別不能にすることで
 * 他人のジョブの存在有無を漏らさない。詳細は `.issue/12/adr.md` の ADR-004。
 *
 * Issue #636: ジョブ存在確認（not-found 判定）は route handler 側で行う。
 * このルートは単一ローダーで、存在確認＝全データ取得のため、handler が
 * 取得済みの DTO をそのまま props で渡す（Suspense 境界は設けない —
 * `.issue/636/adr.md` ADR-008）。
 */
export function ExportJobNotFound() {
  return (
    <main>
      <div role="alert">
        <h1>ジョブが見つかりません</h1>
        <p>ジョブが見つからないか、アクセス権限がありません。</p>
      </div>
    </main>
  );
}

export function ExportJobDetailPage({ job }: { job: ExportJobDTO }) {
  return (
    <main>
      <h1>エクスポートジョブ詳細</h1>
      <ExportJobDetailView job={job} />
    </main>
  );
}
