import { requireAdminUser } from "@/lib/server/currentUser";
import { loadInstanceSettings } from "../LLMSettingsForm/action";
import { RegistrationForm } from "./index";

export async function RegistrationPage() {
  const actor = await requireAdminUser();
  const { settings } = await loadInstanceSettings(actor.id);
  return (
    <main className="admin-main narrow">
      <h1 className="admin-page-title">登録制御</h1>
      <p className="admin-page-subtitle">
        新規サインアップの公開状態を切り替えます。
      </p>
      <RegistrationForm initial={settings.registration} />
    </main>
  );
}
