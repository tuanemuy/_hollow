import { Suspense } from "react";
import { AdminTableSkeleton } from "@/components/common/AdminTableSkeleton";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import { loadInstanceSettings } from "../LLMSettingsForm/action";
import { RegistrationForm } from "./index";

/**
 * Admin registration shell (Issue #636). The admin guard runs in the
 * route handler; the form streams behind its boundary.
 */
export function RegistrationPage({ actorId }: Readonly<{ actorId: string }>) {
  return (
    <main className="max-w-[880px] mx-auto px-[var(--container-padding)] pt-10 pb-20">
      <h1 className="text-3xl font-regular tracking-tightest leading-tight m-0 mb-2">
        登録制御
      </h1>
      <p className="text-md text-ink-secondary m-0 mb-8">
        新規サインアップの公開状態を切り替えます。
      </p>
      <SectionErrorBoundary section="登録制御">
        <Suspense
          fallback={<AdminTableSkeleton ariaLabel="登録制御を読み込み中" />}
        >
          <RegistrationSection actorId={actorId} />
        </Suspense>
      </SectionErrorBoundary>
    </main>
  );
}

async function RegistrationSection({ actorId }: Readonly<{ actorId: string }>) {
  const { settings } = await loadInstanceSettings(actorId);
  return <RegistrationForm initial={settings.registration} />;
}
