import { toUserDTO } from "@/core/application/dto/identity";
import { requireCurrentUser } from "@/lib/server/currentUser";
import { SecurityForm } from "./index";

export async function SecurityPage() {
  const user = await requireCurrentUser();
  return (
    <main>
      <h1>セキュリティ設定</h1>
      <SecurityForm user={toUserDTO(user)} />
    </main>
  );
}
