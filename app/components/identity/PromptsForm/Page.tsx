import { requireCurrentUser } from "@/lib/server/currentUser";
import { loadInstancePromptDefaults, loadUserPromptOverride } from "./action";
import { PromptsForm } from "./index";

export async function PromptsPage() {
  const user = await requireCurrentUser();
  const [{ defaults }, { prompts }] = await Promise.all([
    loadInstancePromptDefaults(),
    loadUserPromptOverride(user.id),
  ]);
  return (
    <main>
      <h1 className="sr-only">プロンプト設定</h1>
      <PromptsForm defaults={defaults} overrides={prompts} />
    </main>
  );
}
