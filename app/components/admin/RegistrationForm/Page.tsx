import { requireAdminUser } from "@/lib/server/currentUser";
import { loadInstanceSettings } from "../LLMSettingsForm/action";
import { RegistrationForm } from "./index";

export async function RegistrationPage() {
  const actor = await requireAdminUser();
  const { settings } = await loadInstanceSettings(actor.id);
  return (
    <main className="max-w-[880px] mx-auto px-[var(--container-padding)] pt-10 pb-20">
      <h1 className="text-3xl font-regular tracking-tightest leading-tight m-0 mb-2">
        登録制御
      </h1>
      <p className="text-md text-ink-secondary m-0 mb-8">
        新規サインアップの公開状態を切り替えます。
      </p>
      <RegistrationForm initial={settings.registration} />
    </main>
  );
}
