import { Suspense } from "react";
import { AdminTableSkeleton } from "@/components/common/AdminTableSkeleton";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import { loadInstanceSettings } from "../LLMSettingsForm/action";
import { PromptsForm } from "./index";

/**
 * Admin prompts shell (Issue #636). The admin guard runs in the route
 * handler; the prompts form streams behind its boundary.
 */
export function PromptsPage({ actorId }: Readonly<{ actorId: string }>) {
  return (
    <main className="max-w-[880px] mx-auto px-[var(--container-padding)] pt-10 pb-20">
      <h1 className="text-3xl font-regular tracking-tightest leading-tight m-0 mb-2">
        プロンプト設定
      </h1>
      <p className="text-md text-ink-secondary m-0 mb-8">
        インスタンス共通のシステムプロンプト。ユーザーが個別に上書きしない限り、これらが使われます。
      </p>
      <SectionErrorBoundary section="プロンプト設定">
        <Suspense
          fallback={
            <AdminTableSkeleton ariaLabel="プロンプト設定を読み込み中" />
          }
        >
          <PromptsSection actorId={actorId} />
        </Suspense>
      </SectionErrorBoundary>
    </main>
  );
}

async function PromptsSection({ actorId }: Readonly<{ actorId: string }>) {
  const { settings } = await loadInstanceSettings(actorId);
  return (
    <PromptsForm
      prompts={settings.prompts}
      promptDefaults={settings.promptDefaults}
    />
  );
}
