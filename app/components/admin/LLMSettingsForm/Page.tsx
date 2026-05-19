import { requireAdminUser } from "@/lib/server/currentUser";
import { loadInstanceSettings } from "./action";
import { LLMSettingsForm } from "./index";

export async function LLMSettingsPage() {
  const actor = await requireAdminUser();
  const { settings } = await loadInstanceSettings(actor.id);
  return (
    <main className="max-w-[880px] mx-auto px-[var(--container-padding)] pt-10 pb-20">
      <h1 className="text-3xl font-regular tracking-tightest leading-tight m-0 mb-2">
        LLM 設定
      </h1>
      <p className="text-md text-ink-secondary m-0 mb-8">
        API キー・モデルの設定。変更は即時に反映されます。
      </p>
      <LLMSettingsForm settings={settings} />
    </main>
  );
}
