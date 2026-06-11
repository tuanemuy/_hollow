import { Suspense } from "react";
import { AdminTableSkeleton } from "@/components/common/AdminTableSkeleton";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import { loadInstanceSettings } from "./action";
import { LLMSettingsForm } from "./index";

/**
 * Admin LLM settings shell. The admin guard runs in the
 * route handler; the settings form streams behind its boundary.
 */
export function LLMSettingsPage({ actorId }: Readonly<{ actorId: string }>) {
  return (
    <main className="max-w-[880px] mx-auto px-[var(--container-padding)] pt-10 pb-20">
      <h1 className="text-3xl font-regular tracking-tightest leading-tight m-0 mb-2">
        LLM 設定
      </h1>
      <p className="text-md text-ink-secondary m-0 mb-8">
        API キー・モデルの設定。変更は即時に反映されます。
      </p>
      <SectionErrorBoundary section="LLM 設定">
        <Suspense
          fallback={<AdminTableSkeleton ariaLabel="LLM 設定を読み込み中" />}
        >
          <LLMSettingsSection actorId={actorId} />
        </Suspense>
      </SectionErrorBoundary>
    </main>
  );
}

async function LLMSettingsSection({ actorId }: Readonly<{ actorId: string }>) {
  const { settings } = await loadInstanceSettings(actorId);
  return <LLMSettingsForm settings={settings} />;
}
