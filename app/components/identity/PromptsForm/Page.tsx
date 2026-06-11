import { Suspense } from "react";
import { FormSkeleton } from "@/components/common/FormSkeleton";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import { loadInstancePromptDefaults, loadUserPromptOverride } from "./action";
import { PromptsForm } from "./index";

/**
 * Prompts settings shell. Auth stays in the route handler;
 * defaults + overrides stream behind one `<Suspense>` boundary because
 * `PromptsForm` is a single client component needing both.
 */
export function PromptsPage({ userId }: Readonly<{ userId: string }>) {
  return (
    <main>
      <h1 className="sr-only">プロンプト設定</h1>
      <SectionErrorBoundary section="プロンプト設定">
        <Suspense
          fallback={<FormSkeleton ariaLabel="プロンプト設定を読み込み中" />}
        >
          <PromptsSection userId={userId} />
        </Suspense>
      </SectionErrorBoundary>
    </main>
  );
}

async function PromptsSection({ userId }: Readonly<{ userId: string }>) {
  const [{ defaults }, { prompts }] = await Promise.all([
    loadInstancePromptDefaults(),
    loadUserPromptOverride(userId),
  ]);
  return <PromptsForm defaults={defaults} overrides={prompts} />;
}
