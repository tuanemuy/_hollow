import { requireAdminUser } from "@/lib/server/currentUser";
import { loadInstanceSettings } from "../LLMSettingsForm/action";
import { PromptsForm } from "./index";

export async function PromptsPage() {
  const actor = await requireAdminUser();
  const { settings } = await loadInstanceSettings(actor.id);
  return (
    <main className="admin-main narrow">
      <h1 className="admin-page-title">プロンプト設定</h1>
      <p className="admin-page-subtitle">
        インスタンス共通のシステムプロンプト。ユーザーが個別に上書きしない限り、これらが使われます。
      </p>
      <PromptsForm prompts={settings.prompts} />
    </main>
  );
}
