import { requireAdminUser } from "@/lib/server/currentUser";
import { loadInstanceSettings } from "../LLMSettingsForm/action";
import { DesignTokensForm } from "./index";

export async function DesignTokensPage() {
  const actor = await requireAdminUser();
  const { settings } = await loadInstanceSettings(actor.id);
  return (
    <main className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] pt-10 pb-20">
      <h1 className="text-3xl font-regular tracking-tightest leading-tight m-0 mb-2">
        デザイントークン
      </h1>
      <p className="text-md text-ink-secondary m-0 mb-8">
        インスタンス全体のデザイントークン。エクスポート時の CSS
        に注入されます。
      </p>
      <DesignTokensForm initialTokens={settings.designTokens} />
    </main>
  );
}
