import { requireAdminUser } from "@/lib/server/currentUser";
import { loadInstanceSettings } from "./action";
import { LLMSettingsForm } from "./index";

export async function LLMSettingsPage() {
  const actor = await requireAdminUser();
  const { settings } = await loadInstanceSettings(actor.id);
  return (
    <main className="admin-main narrow">
      <h1 className="admin-page-title">LLM 設定</h1>
      <p className="admin-page-subtitle">
        API キー・モデルの設定。変更は即時に反映されます。
      </p>
      <LLMSettingsForm settings={settings} />
    </main>
  );
}
