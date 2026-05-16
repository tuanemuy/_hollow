import { requireAdminUser } from "@/lib/server/currentUser";
import { loadInstanceSettings } from "../LLMSettingsForm/action";
import { DesignTokensForm } from "./index";

export async function DesignTokensPage() {
  const actor = await requireAdminUser();
  const { settings } = await loadInstanceSettings(actor.id);
  return (
    <main className="admin-main">
      <h1 className="admin-page-title">デザイントークン</h1>
      <p className="admin-page-subtitle">
        インスタンス全体のデザイントークン。エクスポート時の CSS
        に注入されます。
      </p>
      <DesignTokensForm initialTokens={settings.designTokens} />
    </main>
  );
}
