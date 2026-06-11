import { Suspense } from "react";
import { FormSkeleton } from "@/components/common/FormSkeleton";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import { loadInstanceSettings } from "../LLMSettingsForm/action";
import { DesignTokensForm } from "./index";

/**
 * Admin design tokens shell (Issue #636). The admin guard runs in the
 * route handler; the form streams behind its boundary. Uses the form
 * archetype skeleton — this page is outside the P45 table archetype
 * (`.issue/636/plan.md` step 6).
 */
export function DesignTokensPage({ actorId }: Readonly<{ actorId: string }>) {
  return (
    <main className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] pt-10 pb-20">
      <h1 className="text-3xl font-regular tracking-tightest leading-tight m-0 mb-2">
        デザイントークン
      </h1>
      <p className="text-md text-ink-secondary m-0 mb-8">
        インスタンス全体のデザイントークン。ビルトインの既定値が初期表示され、値を変更すると上書きされます。エクスポート時の
        CSS に注入されます。
      </p>
      <SectionErrorBoundary section="デザイントークン">
        <Suspense
          fallback={
            <FormSkeleton fields={4} ariaLabel="デザイントークンを読み込み中" />
          }
        >
          <DesignTokensSection actorId={actorId} />
        </Suspense>
      </SectionErrorBoundary>
    </main>
  );
}

async function DesignTokensSection({ actorId }: Readonly<{ actorId: string }>) {
  const { settings } = await loadInstanceSettings(actorId);
  return (
    <DesignTokensForm
      designTokens={settings.designTokens}
      designTokenDefaults={settings.designTokenDefaults}
    />
  );
}
