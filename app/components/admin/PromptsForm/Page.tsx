import { requireAdminUser } from "@/lib/server/currentUser";
import { loadInstanceSettings } from "../LLMSettingsForm/action";
import { PromptsForm } from "./index";

export async function PromptsPage() {
  const actor = await requireAdminUser();
  const { settings } = await loadInstanceSettings(actor.id);
  return (
    <main className="max-w-[880px] mx-auto px-[var(--container-padding)] pt-10 pb-20">
      <h1 className="text-3xl font-regular tracking-tightest leading-tight m-0 mb-2">
        プロンプト設定
      </h1>
      <p className="text-md text-ink-secondary m-0 mb-8">
        インスタンス共通のシステムプロンプト。ユーザーが個別に上書きしない限り、これらが使われます。
      </p>
      <PromptsForm prompts={settings.prompts} />
    </main>
  );
}
